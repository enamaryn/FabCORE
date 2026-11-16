import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createFabCore } from './server.mjs';
import { moonrakerOrigin, readMoonraker } from './moonraker.mjs';

const printer = { origin: 'http://192.168.1.40:7125', apiKey: 'key-test' };
const sample = {
  result: {
    status: {
      webhooks: { state: 'ready' }, print_stats: { state: 'printing', filename: 'support.gcode' },
      virtual_sdcard: { progress: 0.463 }, extruder: { temperature: 205.12 }, heater_bed: { temperature: 60.18 }
    }
  }
};

test('Moonraker utilise une requête GET fixe et normalise la télémétrie', async () => {
  const result = await readMoonraker(printer, async (url, request) => {
    assert.equal(url, printer.origin + '/printer/objects/query?webhooks&print_stats&virtual_sdcard&extruder&heater_bed');
    assert.equal(request.method, 'GET');
    assert.equal(request.redirect, 'error');
    assert.equal(request.headers['X-Api-Key'], 'key-test');
    return Response.json(sample);
  });
  assert.deepEqual(result, { status: 'printing', issue: null, progress: 46, file: 'support.gcode', nozzle: 205.1, bed: 60.2 });
});

test('Moonraker distingue un accès refusé, Klippy indisponible et la perte de liaison', async () => {
  assert.equal((await readMoonraker(printer, async () => new Response('', { status: 401 }))).issue, 'access');
  assert.equal((await readMoonraker(printer, async () => Response.json({ result: { status: { webhooks: { state: 'shutdown' } } } }))).issue, 'klippy');
  assert.equal((await readMoonraker(printer, async () => { throw new TypeError('connection'); })).status, 'offline');
  assert.equal((await readMoonraker(printer, async () => new Response('bad JSON'))).issue, 'moonraker');
});

test('les adresses Moonraker restent des origines IPv4 privées', () => {
  assert.equal(moonrakerOrigin(printer.origin), printer.origin);
  for (const origin of [
    'http://127.0.0.1:7125', 'http://169.254.169.254', 'http://8.8.8.8', 'http://moonraker.local',
    'http://192.168.1.40/api', 'http://192.168.1.40/?a=b', 'http://user:pass@192.168.1.40',
    'file:///tmp/foo', 'http://192.168.1.40/#anchor'
  ]) assert.equal(moonrakerOrigin(origin), null, origin);
});

test('parcours HTTP : activation unique, session, registre, télémétrie et reconnexion', async (ctx) => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  let connected = true;
  let reads = 0;
  const origin = 'http://fabcore.test';
  const { server, token } = createFabCore({ directory, origin, activationToken: 'test-activation-token', readCC2: async (machine) => {
    const serial = machine.origin.endsWith('.54:1883') ? 'CC2TEST02' : 'CC2TEST01';
    const issue = machine.serial && machine.serial !== serial ? 'elegoo-identity' : null;
    return { serial, issue, status: issue ? 'error' : 'ready', nozzle: 25, bed: 24, progress: 0, file: '' };
  }, readPrinter: (machine) =>
    readMoonraker(machine, async () => {
      reads++;
      if (!connected) throw new TypeError('connection failed');
      return Response.json(sample);
    })
  });
  ctx.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (url, { body, cookie, requestOrigin = origin, host = 'fabcore.test' } = {}) => new Promise((resolve, reject) => {
    const req = request(base + url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Host: host, Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }
    }, async (response) => {
      try {
        const chunks = [];
        for await (const chunk of response) chunks.push(chunk);
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers }));
      } catch (error) { reject(error); }
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const session = (response) => response.headers.get('set-cookie').split(';')[0];

  const page = await call('/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /data-live/);
  assert.equal((await call('/shared.js')).status, 200);
  assert.equal((await call('/live.js')).status, 200);
  assert.equal((await call('/api/session', { host: 'unexpected.test' })).status, 421);
  assert.deepEqual(await (await call('/api/session')).json(), { installed: false, authenticated: false, username: null });
  assert.equal((await call('/api/machines')).status, 401);
  const credentials = { username: 'atelier', password: 'demo-password-long' };
  assert.equal((await call('/api/setup', { body: { ...credentials, token }, requestOrigin: 'http://other.test' })).status, 403);
  assert.equal((await call('/api/setup', { body: { ...credentials, token: 'wrong' } })).status, 403);
  const attempts = await Promise.all([
    call('/api/setup', { body: { ...credentials, token } }),
    call('/api/setup', { body: { ...credentials, token } })
  ]);
  assert.deepEqual(attempts.map(response => response.status).sort(), [200, 409]);
  const activation = attempts.find(response => response.ok);
  assert.match(activation.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const cookie = session(activation);
  assert.equal((await call('/api/setup', { body: { ...credentials, token } })).status, 409);
  const add = { name: 'Ender 3 V2', origin: printer.origin, apiKey: printer.apiKey };
  assert.equal((await call('/api/machines', { body: add })).status, 401);
  const created = await call('/api/machines', { body: add, cookie });
  assert.equal(created.status, 201);
  const id = (await created.json()).id;
  assert.equal((await call('/api/machines', { body: add, cookie })).status, 409);
  assert.equal((await call('/api/machines/' + id + '/pause', { body: {}, cookie })).status, 404);
  async function stateIs(status) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const [machine] = (await (await call('/api/machines', { cookie })).json()).machines;
      if (machine.status === status) return machine;
      await delay(50);
    }
    assert.fail('Transition non observée : ' + status);
  }
  const printing = await stateIs('printing');
  assert.equal(printing.id, id);
  assert.equal(printing.progress, 46);
  assert.equal(printing.nozzle, 205.1);
  assert.equal(printing.bed, 60.2);
  assert.equal(printing.apiKey, undefined);
  connected = false;
  const offline = await stateIs('offline');
  assert.equal(offline.nozzle, null);
  assert.equal(offline.bed, null);
  assert.equal(offline.id, id);
  connected = true;
  assert.equal((await stateIs('printing')).id, id);
  assert.ok(reads >= 3);
  const changed = { ...add, id, name: 'Ender renommée', origin: 'http://192.168.1.41:7125', apiKey: '' };
  assert.equal((await call('/api/machines/test', { body: changed })).status, 401);
  assert.deepEqual(await (await call('/api/machines/test', { body: changed, cookie })).json(), { ok: true, issue: null });
  assert.equal((await stateIs('printing')).name, add.name);
  assert.deepEqual(await (await call('/api/machines/edit', { body: changed, cookie })).json(), { id });
  const edited = await stateIs('printing');
  assert.equal(edited.name, changed.name);
  assert.equal(edited.origin, changed.origin);
  assert.equal(edited.apiKey, undefined);
  const cc2 = { kind: 'elegoo', host: '192.168.1.53', accessCode: 'ExampleCode', name: 'CC2 atelier' };
  assert.deepEqual(await (await call('/api/machines/test', { body: cc2, cookie })).json(), { ok: true, issue: null });
  const firstCC2 = await call('/api/machines', { body: cc2, cookie });
  assert.equal(firstCC2.status, 201);
  const firstCC2Id = (await firstCC2.json()).id;
  const secondCC2 = await call('/api/machines', { body: { ...cc2, host: '192.168.1.54', name: 'CC2 bureau' }, cookie });
  assert.equal(secondCC2.status, 201);
  assert.equal((await call('/api/machines', { body: { ...cc2, host: '192.168.1.55' }, cookie })).status, 409);
  const movedCC2 = { ...cc2, id: firstCC2Id, host: '192.168.1.55', accessCode: '' };
  assert.deepEqual(await (await call('/api/machines/edit', { body: movedCC2, cookie })).json(), { id: firstCC2Id });
  const wrongCC2 = await call('/api/machines/edit', { body: { ...movedCC2, host: '192.168.1.54' }, cookie });
  assert.equal(wrongCC2.status, 422);
  assert.deepEqual(await wrongCC2.json(), { error: 'elegoo-identity' });
  const fleet = await (await call('/api/machines', { cookie })).json();
  assert.ok(!JSON.stringify(fleet).includes(cc2.accessCode));
  assert.deepEqual(fleet.machines.slice(1).map(({ serial, origin }) => [serial, origin]), [
    ['CC2TEST01', 'mqtt://192.168.1.55:1883'], ['CC2TEST02', 'mqtt://192.168.1.54:1883']
  ]);
  const file = join(directory, 'state.json');
  const text = await readFile(file, 'utf8');
  assert.ok(!text.includes(credentials.password) && !text.includes(token));
  assert.equal(JSON.parse(text).machines[0].apiKey, printer.apiKey);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const reopened = createFabCore({ directory, origin });
  assert.equal(reopened.token, null);
  assert.equal((await call('/api/logout', { body: {}, cookie })).status, 200);
  assert.equal((await call('/api/machines', { cookie })).status, 401);
  const login = await call('/api/login', { body: credentials });
  assert.equal(login.status, 200);
  assert.equal((await call('/api/machines', { cookie: session(login) })).status, 200);
});
