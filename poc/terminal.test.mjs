import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createFabCore, harmlessGcode } from './server.mjs';
import { sendMoonrakerGcode } from './moonraker.mjs';
import { sendOctoPrintGcode } from './octoprint.mjs';

const klipper = { origin: 'http://192.168.1.40:7125', apiKey: 'key-test' };
const octo = { origin: 'http://192.168.1.42:5000', apiKey: 'octo-key' };

test('Moonraker exécute le script puis relit les réponses qui suivent la commande', async () => {
  const requests = [];
  const result = await sendMoonrakerGcode(klipper, 'M105', async (url, options) => {
    requests.push([url, options.method, options.body]);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['X-Api-Key'], klipper.apiKey);
    if (url.endsWith('/printer/gcode/script')) return Response.json({ result: 'ok' });
    return Response.json({ result: { gcode_store: [
      { message: 'M105', type: 'command', time: 1 }, { message: 'ancienne', type: 'response', time: 1 },
      { message: 'M105', type: 'command', time: 2 }, { message: 'ok T:21.3 /0.0 B:21.0 /0.0', type: 'response', time: 2 }
    ] } });
  });
  assert.deepEqual(requests, [
    [klipper.origin + '/printer/gcode/script', 'POST', JSON.stringify({ script: 'M105' })],
    [klipper.origin + '/server/gcode_store?count=50', 'GET', undefined]
  ]);
  assert.deepEqual(result, { outcome: 'executed', responses: ['ok T:21.3 /0.0 B:21.0 /0.0'] });
});

test('Moonraker distingue refus, réponses indisponibles et résultat inconnu', async () => {
  const refused = await sendMoonrakerGcode(klipper, 'FOO', async () => Response.json({ error: { code: 400, message: 'Unknown command:"FOO"' } }, { status: 400 }));
  assert.deepEqual(refused, { outcome: 'rejected', message: 'Unknown command:"FOO"' });
  const noStore = await sendMoonrakerGcode(klipper, 'G28', async (url) => url.endsWith('/script') ? Response.json({ result: 'ok' }) : new Response('', { status: 404 }));
  assert.deepEqual(noStore, { outcome: 'executed', responses: null });
  await assert.rejects(sendMoonrakerGcode(klipper, 'G28', async () => new Response('', { status: 502 })));
  await assert.rejects(sendMoonrakerGcode(klipper, 'G28', async () => { throw new TypeError('connection lost'); }));
  assert.equal((await sendMoonrakerGcode({ origin: 'http://8.8.8.8' }, 'G28', () => assert.fail())).outcome, 'rejected');
});

test('OctoPrint indique une commande acceptée sans prétendre à son exécution', async () => {
  const accepted = await sendOctoPrintGcode(octo, 'G28 X', async (url, options) => {
    assert.equal(url, octo.origin + '/api/printer/command');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-Api-Key'], octo.apiKey);
    assert.deepEqual(JSON.parse(options.body), { commands: ['G28 X'] });
    return new Response(null, { status: 204 });
  });
  assert.deepEqual(accepted, { outcome: 'accepted', responses: null });
  assert.deepEqual(await sendOctoPrintGcode(octo, 'M105', async () => new Response('', { status: 409 })), { outcome: 'rejected', message: 'octoprint-disconnected' });
  await assert.rejects(sendOctoPrintGcode(octo, 'M105', async () => new Response('', { status: 500 })));
});

test('seules les lectures d’état passent sans confirmation pendant une impression', () => {
  for (const command of ['M105', 'm114', 'STATUS', 'QUERY_ENDSTOPS']) assert.equal(harmlessGcode(command), true, command);
  for (const command of ['G28', 'M104 S200', 'CANCEL_PRINT', 'M112', 'G1 X10']) assert.equal(harmlessGcode(command), false, command);
});

test('parcours HTTP du terminal : droits, état, confirmation, débit et résultat inconnu', async (ctx) => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-terminal-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  let status = 'ready';
  let failure = false;
  const sent = [];
  const origin = 'http://fabcore.test';
  const { server, token } = createFabCore({
    directory, origin, activationToken: 'test-activation-token',
    readPrinter: async () => ({ status, issue: status === 'offline' ? 'connection' : null, nozzle: 20, bed: 20, progress: 0, file: '' }),
    readPrusa: async () => ({ status: 'ready', issue: null, nozzle: 20, bed: 20, progress: 0, file: '' }),
    sendGcode: async (machine, script) => {
      sent.push(script);
      if (failure) throw new Error('connection lost after sending');
      return { outcome: 'executed', responses: ['ok'] };
    }
  });
  ctx.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (url, { body, cookie } = {}) => new Promise((resolve, reject) => {
    const req = request(base + url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Host: 'fabcore.test', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }
    }, async (response) => {
      const chunks = [];
      for await (const chunk of response) chunks.push(chunk);
      resolve({ status: response.statusCode, headers: response.headers, json: JSON.parse(Buffer.concat(chunks).toString() || 'null') });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const activation = await call('/api/setup', { body: { username: 'atelier', password: 'demo-password-long', token } });
  const cookie = activation.headers['set-cookie'][0].split(';')[0];
  const { id } = (await call('/api/machines', { body: { name: 'Voron', origin: klipper.origin, apiKey: klipper.apiKey }, cookie })).json;
  const prusa = (await call('/api/machines', { body: { kind: 'prusalink', name: 'MK4', origin: 'http://192.168.1.69', apiKey: 'prusa-key' }, cookie })).json.id;
  await call('/api/observers', { body: { username: 'observateur', password: 'observer-demo-password' }, cookie });
  const watcher = (await call('/api/login', { body: { username: 'observateur', password: 'observer-demo-password' } })).headers['set-cookie'][0].split(';')[0];
  const path = '/api/machines/' + id + '/gcode';
  const wait = () => delay(520);

  assert.equal((await call(path, { body: { command: 'M105' } })).status, 401);
  assert.equal((await call(path, { body: { command: 'M105' }, cookie: watcher })).status, 403);
  assert.equal((await call('/api/machines/' + prusa + '/gcode', { body: { command: 'M105' }, cookie })).status, 404);
  for (const command of ['', 'G28\nG1 X0', 'é', 'x'.repeat(257), 42]) {
    assert.equal((await call(path, { body: { command }, cookie })).status, 400, JSON.stringify(command));
  }
  assert.deepEqual(sent, []);

  const executed = await call(path, { body: { command: '  M105  ' }, cookie });
  assert.deepEqual([executed.status, executed.json], [200, { outcome: 'executed', responses: ['ok'] }]);
  assert.equal((await call(path, { body: { command: 'M105' }, cookie })).json.error, 'rate');
  assert.deepEqual(sent, ['M105']);

  await wait();
  status = 'offline';
  assert.deepEqual((await call(path, { body: { command: 'M105' }, cookie })).json, { error: 'terminal-offline' });

  await wait();
  status = 'printing';
  assert.deepEqual((await call(path, { body: { command: 'G28' }, cookie })).json, { error: 'terminal-confirm' });
  await wait();
  assert.equal((await call(path, { body: { command: 'M105' }, cookie })).status, 200);
  await wait();
  assert.equal((await call(path, { body: { command: 'G28', confirm: true }, cookie })).status, 200);
  assert.deepEqual(sent, ['M105', 'M105', 'G28']);

  await wait();
  failure = true;
  const unknown = await call(path, { body: { command: 'M104 S0', confirm: true }, cookie });
  assert.deepEqual([unknown.status, unknown.json], [504, { error: 'command-unconfirmed' }]);
  assert.deepEqual(sent, ['M105', 'M105', 'G28', 'M104 S0'], 'aucun renvoi automatique');

  const diagnostics = (await call('/api/diagnostics', { cookie })).json;
  assert.ok(diagnostics.events.some(event => event.area === 'terminal' && event.code === 'unconfirmed' && event.id === id));
  assert.ok(!JSON.stringify(diagnostics).includes('M104'), 'le journal de diagnostic ne contient pas les commandes');
});
