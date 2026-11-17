import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createFabCore } from './server.mjs';
import { commandMoonraker, moonrakerOrigin, readMoonraker } from './moonraker.mjs';

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

test('Moonraker envoie uniquement les commandes pause et reprise vers la cible configurée', async () => {
  for (const action of ['pause', 'resume']) {
    assert.equal(await commandMoonraker(printer, action, async (url, options) => {
      assert.equal(url, printer.origin + '/printer/print/' + action);
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['X-Api-Key'], printer.apiKey);
      return Response.json({ result: 'ok' });
    }), true);
  }
  assert.equal(await commandMoonraker(printer, 'cancel', () => assert.fail()), false);
  await assert.rejects(commandMoonraker(printer, 'pause', async () => new Response('', { status: 502 })));
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
  let printState = 'printing';
  const commands = [];
  const notices = [];
  let ambiguousCommand = false;
  const origin = 'http://fabcore.test';
  const cameraInputs = new Map();
  let cameraContentType = 'multipart/x-mixed-replace; boundary=frame';
  const { server, token } = createFabCore({ directory, origin, activationToken: 'test-activation-token',
    notify: async (channel, config, internal) => {
      notices.push([channel, config.ntfy.topic, internal]);
      return true;
    },
    sendCommand: async (machine, action) => {
      commands.push([machine.id, machine.origin, action]);
      if (ambiguousCommand) throw new Error('Connection lost after sending');
      printState = action === 'pause' ? 'paused' : 'printing';
      return true;
    },
    networks: () => [{ cidr: '192.168.1.0/24' }],
    scan: async (network) => {
      assert.equal(network.cidr, '192.168.1.0/24');
      return [{ kind: 'elegoo', host: '192.168.1.55', serial: 'CC2TEST01' }];
    },
    readPrusa: async () => ({ status: 'printing', issue: null, nozzle: 210, bed: 60, progress: 37, file: 'support.bgcode' }),
    readOcto: async () => ({ status: 'ready', issue: null, nozzle: 30, bed: 20, progress: 0, file: '' }),
    identifyCC2: async (machine) => ({ serial: machine.serial }),
    openCamera: async (url) => {
      assert.equal(url.port, '8080');
      assert.equal(url.pathname, '/video');
      const input = new PassThrough();
      input.statusCode = 200;
      input.headers = { 'content-type': cameraContentType };
      cameraInputs.set(url.hostname, input);
      input.write('frame from ' + url.hostname);
      return input;
    },
    readCC2: async (machine) => {
    const serial = machine.origin.endsWith('.54:1883') ? 'CC2TEST02' : 'CC2TEST01';
    const issue = machine.serial && machine.serial !== serial ? 'elegoo-identity' : null;
    return { serial, issue, status: issue ? 'error' : 'ready', nozzle: 25, bed: 24, progress: 0, file: '' };
  }, readPrinter: (machine) =>
    readMoonraker(machine, async () => {
      reads++;
      if (!connected) throw new TypeError('connection failed');
      const telemetry = structuredClone(sample);
      telemetry.result.status.print_stats.state = printState;
      return Response.json(telemetry);
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
  const commandPath = '/api/machines/' + id + '/command';
  const observer = { username: 'observateur', password: 'observer-demo-password' };
  assert.equal((await call('/api/observers', { body: observer, cookie })).status, 201);
  const watchLogin = await call('/api/login', { body: observer });
  assert.deepEqual(await watchLogin.json(), { authenticated: true, username: observer.username, role: 'observer' });
  const watchCookie = session(watchLogin);
  assert.equal((await call('/api/machines/delete', { body: { id }, cookie: watchCookie })).status, 403);
  const diagnosticsPath = '/api/diagnostics';
  assert.equal((await call(diagnosticsPath)).status, 401);
  assert.equal((await call(diagnosticsPath, { cookie: watchCookie })).status, 403);
  const diagnostics = await (await call(diagnosticsPath, { cookie })).json();
  assert.deepEqual(diagnostics.fleet, [{ id, name: changed.name }]);
  assert.ok(diagnostics.events.some((event) => event.area === 'server' && event.code === 'started'));
  assert.ok(diagnostics.events.some((event) => event.id === id && event.code === 'printing'));
  assert.ok(!JSON.stringify(diagnostics).includes(changed.origin));
  const notificationsPath = '/api/notifications';
  const notificationForm = { ntfy: { mode: 'external', url: 'https://ntfy.example.test', topic: 'fabcore', auth: 'bearer', secret: 'sample-token' }, smtp: { enabled: false } };
  assert.equal((await call(notificationsPath)).status, 401);
  assert.equal((await call(notificationsPath, { cookie: watchCookie })).status, 403);
  assert.equal((await call(notificationsPath + '/test', { body: { channel: 'ntfy' }, cookie: watchCookie })).status, 403);
  assert.equal((await call(notificationsPath, { body: notificationForm, cookie, requestOrigin: 'http://other.test' })).status, 403);
  const savedNotifications = await call(notificationsPath, { body: notificationForm, cookie });
  assert.equal(savedNotifications.status, 200);
  assert.ok(!(await savedNotifications.text()).includes(notificationForm.ntfy.secret));
  const readNotifications = await (await call(notificationsPath, { cookie })).json();
  assert.equal(readNotifications.ntfy.mode, 'external');
  assert.equal(readNotifications.ntfy.secret, undefined);
  assert.deepEqual(await (await call(notificationsPath + '/test', { body: { channel: 'ntfy' }, cookie })).json(), { accepted: true });
  assert.deepEqual(notices, [['ntfy', 'fabcore', null]]);
  assert.equal((await call('/api/machines', { cookie: watchCookie })).status, 200);
  assert.equal((await call(commandPath, { body: { action: 'pause' } })).status, 401);
  assert.equal((await call(commandPath, { body: { action: 'pause' }, cookie: watchCookie })).status, 403);
  assert.equal((await call('/api/machines', { body: add, cookie: watchCookie })).status, 403);
  assert.equal((await call('/api/discovery', { cookie: watchCookie })).status, 403);
  assert.equal((await call(commandPath, { body: { action: 'resume' }, cookie })).status, 409);
  assert.equal((await call(commandPath, { body: { action: 'pause' }, cookie, requestOrigin: 'http://other.test' })).status, 403);
  assert.deepEqual(commands, []);
  assert.deepEqual(await (await call(commandPath, { body: { action: 'pause' }, cookie })).json(), { status: 'paused' });
  assert.equal((await stateIs('paused')).id, id);
  assert.deepEqual(await (await call(commandPath, { body: { action: 'resume' }, cookie })).json(), { status: 'printing' });
  assert.deepEqual(commands, [[id, changed.origin, 'pause'], [id, changed.origin, 'resume']]);
  ambiguousCommand = true;
  const unconfirmed = await call(commandPath, { body: { action: 'pause' }, cookie });
  assert.equal(unconfirmed.status, 504);
  assert.deepEqual(await unconfirmed.json(), { error: 'command-unconfirmed' });
  assert.equal(commands.length, 3);
  ambiguousCommand = false;
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
  const secondCC2Id = (await secondCC2.json()).id;
  const cameraPath = (id) => '/api/machines/' + id + '/camera';
  assert.equal((await call(cameraPath(firstCC2Id))).status, 401);
  assert.equal((await call(cameraPath(id), { cookie })).status, 404);
  assert.equal(cameraInputs.size, 0);
  cameraContentType = 'text/html';
  assert.equal((await call(cameraPath(firstCC2Id), { cookie })).status, 502);
  assert.ok(cameraInputs.get('192.168.1.55').destroyed);
  cameraContentType = 'multipart/x-mixed-replace; boundary=frame';
  const clients = [];
  const openStream = (id, viewerCookie = cookie) => new Promise((resolve, reject) => {
    const client = request(base + cameraPath(id), {
      headers: { Host: 'fabcore.test', Cookie: viewerCookie }
    }, resolve);
    client.setTimeout(3000, () => client.destroy(new Error('Camera test timed out')));
    client.on('error', reject);
    client.end();
    clients.push(client);
  });
  try {
    const [first, second] = await Promise.all([openStream(firstCC2Id), openStream(secondCC2Id)]);
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(first.headers['content-type'], cameraContentType);
    assert.equal(first.headers['x-accel-buffering'], 'no');
    const [frame1, frame2] = await Promise.all([once(first, 'data'), once(second, 'data')]);
    assert.equal(frame1[0].toString(), 'frame from 192.168.1.55');
    assert.equal(frame2[0].toString(), 'frame from 192.168.1.54');
    const upstream = cameraInputs.get('192.168.1.55');
    const joined = openStream(firstCC2Id, watchCookie);
    let watching = false;
    for (let i = 0; i < 20 && !watching; i++) {
      const { machines } = await (await call('/api/machines', { cookie: watchCookie })).json();
      watching = machines.find(({ id }) => id === firstCC2Id).cameraOpen;
    }
    assert.ok(watching);
    upstream.write('discard\r\n--fra');
    upstream.write('me\r\nnext image');
    const observerStream = await joined;
    assert.equal(observerStream.statusCode, 200);
    assert.equal((await once(observerStream, 'data'))[0].toString(), '--frame\r\nnext image');
    assert.equal(cameraInputs.get('192.168.1.55'), upstream);
    first.destroy();
    const observerData = once(observerStream, 'data');
    upstream.write('still watching');
    assert.equal((await observerData)[0].toString(), 'still watching');
    assert.equal(upstream.destroyed, false);
    const upstreamClosed = new Promise(resolve => upstream.once('close', resolve));
    assert.equal((await call('/api/logout', { body: {}, cookie: watchCookie })).status, 200);
    await upstreamClosed;
    const nextFrame = once(second, 'data');
    cameraInputs.get('192.168.1.54').write('another frame');
    assert.equal((await nextFrame)[0].toString(), 'another frame');
    for (const chunk of [[0xff], [0xd8, 0xff], [0xd9]]) {
      const received = once(second, 'data');
      cameraInputs.get('192.168.1.54').write(Buffer.from(chunk));
      await received;
    }
    const cameraDiagnostics = await (await call(diagnosticsPath, { cookie })).json();
    assert.ok(cameraDiagnostics.machines[secondCC2Id].frameAt);
    assert.ok(cameraDiagnostics.events.some((event) => event.id === secondCC2Id && event.code === 'streaming'));
    const secondClosed = new Promise((resolve) => cameraInputs.get('192.168.1.54').once('close', resolve));
    assert.equal((await call('/api/logout', { body: {}, cookie: session(await call('/api/login', { body: credentials })) })).status, 200);
    assert.equal(cameraInputs.get('192.168.1.54').destroyed, false);
    second.destroy();
    await secondClosed;
  } finally {
    for (const client of clients) client.destroy();
  }
  assert.equal((await call('/api/discovery')).status, 401);
  assert.deepEqual(await (await call('/api/discovery', { cookie })).json(), { networks: ['192.168.1.0/24'] });
  const scan = { network: '192.168.1.0/24' };
  assert.equal((await call('/api/discovery', { body: scan, cookie, requestOrigin: 'http://other.test' })).status, 403);
  assert.equal((await call('/api/discovery', { body: { network: '192.168.2.0/24' }, cookie })).status, 400);
  assert.deepEqual(await (await call('/api/discovery', { body: scan, cookie })).json(), {
    devices: [{ kind: 'elegoo', host: '192.168.1.55', serial: 'CC2TEST01', registered: true, name: cc2.name }]
  });
  const octo = { kind: 'octoprint', name: 'OctoPrint', origin: 'http://192.168.1.67:5000', apiKey: 'test-octo-key' };
  assert.equal((await call('/api/machines', { body: { ...octo, apiKey: '' }, cookie })).status, 400);
  assert.deepEqual(await (await call('/api/machines/test', { body: octo, cookie })).json(), { ok: true, issue: null });
  const octoCreated = await call('/api/machines', { body: octo, cookie });
  assert.equal(octoCreated.status, 201);
  const { id: octoId } = await octoCreated.json();
  await call('/api/machines', { cookie });
  const { machines: octoFleet } = await (await call('/api/machines', { cookie })).json();
  const octoView = octoFleet.find(({ id }) => id === octoId);
  assert.equal(octoView.nozzle, 30);
  assert.equal(octoView.apiKey, undefined);
  assert.equal((await call('/api/machines/edit', { body: { ...octo, id: octoId, origin: 'http://192.168.1.68', apiKey: '' }, cookie })).status, 400);
  const prusa = { kind: 'prusalink', name: 'Prusa', origin: 'http://192.168.1.69', apiKey: 'test-prusa-key' };
  assert.deepEqual(await (await call('/api/machines/test', { body: prusa, cookie })).json(), { ok: true, issue: null });
  const prusaAdded = await call('/api/machines', { body: prusa, cookie });
  assert.equal(prusaAdded.status, 201);
  const { id: prusaId } = await prusaAdded.json();
  await call('/api/machines', { cookie });
  const { machines: prusaFleet } = await (await call('/api/machines', { cookie })).json();
  const prusaView = prusaFleet.find(({ id }) => id === prusaId);
  assert.equal(prusaView.progress, 37);
  assert.equal(prusaView.model, 'PrusaLink');
  assert.equal(prusaView.apiKey, undefined);
  const file = join(directory, 'state.json');
  const text = await readFile(file, 'utf8');
  assert.ok(!text.includes(credentials.password) && !text.includes(token));
  assert.equal(JSON.parse(text).machines[0].apiKey, printer.apiKey);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const deletePath = '/api/machines/delete';
  const deleteBody = { id: octoId };
  assert.equal((await call(deletePath, { body: deleteBody })).status, 401);
  assert.deepEqual(await (await call(deletePath, { body: deleteBody, cookie })).json(), deleteBody);
  assert.equal((await call(deletePath, { body: deleteBody, cookie })).status, 404);
  assert.equal((await (await call('/api/machines', { cookie })).json()).machines.some(({ id }) => id === octoId), false);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).machines.some(({ id }) => id === octoId), false);
  assert.equal((await call('/api/machines', { body: octo, cookie })).status, 201);
  const reopened = createFabCore({ directory, origin });
  assert.equal(reopened.token, null);
  assert.equal((await call('/api/logout', { body: {}, cookie })).status, 200);
  assert.equal((await call('/api/machines', { cookie })).status, 401);
  const login = await call('/api/login', { body: credentials });
  assert.equal(login.status, 200);
  assert.equal((await call('/api/machines', { cookie: session(login) })).status, 200);
});
