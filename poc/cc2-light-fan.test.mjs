// CC2 : éclairage (1029) et ventilateurs (1030) bout à bout, avec la vraie session MQTT et un client simulé.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { createElegooMonitor } from './elegoo.mjs';
import { createConnectorRegistry } from './connectors.mjs';

test('CC2 : état éclairage et ventilateurs conservé, commandes 1029/1030 confirmées par le rapport', async () => {
  const machine = { id: 'cc2', kind: 'elegoo', serial: 'CC2LIGHT01', origin: 'mqtt://192.168.1.2:1883', accessCode: 'test-only' };
  const client = new EventEmitter(); client.connected = true;
  let response;
  const commands = [];
  const deliver = (topic, data) => client.emit('message', topic, Buffer.from(JSON.stringify(data)), { retain: false });
  const push = result => deliver(`elegoo/${machine.serial}/api_status`, { method: 6000, result });
  client.subscribe = (_topics, done) => done(null, [{ qos: 0 }, { qos: 0 }, { qos: 0 }]);
  client.end = () => {};
  client.publish = (topic, payload, options, callback) => {
    const data = JSON.parse(payload);
    if (topic.endsWith('/api_register')) deliver(`elegoo/${machine.serial}/${data.request_id}/register_response`, { error: 'ok' });
    else if (data.method === 1002) deliver(response, { id: data.id, method: 1002, result: { machine_status: { status: 1 }, extruder: { temperature: 22, target: 0 }, heater_bed: { temperature: 20, target: 0 },
      led: { status: 1 }, fans: { fan: { speed: 0, rpm: 0 }, aux_fan: { speed: 0 }, box_fan: { speed: 51, rpm: 900 }, heater_fan: { speed: 255, rpm: 8000 }, controller_fan: { speed: 128 } } } });
    else if ([1029, 1030].includes(data.method)) {
      commands.push(data);
      assert.deepEqual(options, { qos: 0, retain: false }, 'aucun rejeu MQTT');
      callback();
      queueMicrotask(() => {
        deliver(response, { id: data.id, method: data.method, result: { error_code: 0 } });
        // Le firmware pousse ensuite un rapport partiel avec le nouvel état.
        if (data.method === 1029) push({ led: { status: data.params.power } });
        else push({ fans: Object.fromEntries(Object.entries(data.params).map(([key, speed]) => [key, { speed }])) });
      });
    }
  };
  const monitor = createElegooMonitor({ fetcher: async () => Response.json({ system_info: { sn: machine.serial } }),
    connectPrinter(_url, options) { response = `elegoo/${machine.serial}/${options.clientId}/api_response`; queueMicrotask(() => client.emit('connect')); return client; } });
  const registry = createConnectorRegistry({}, () => ({ controls: true, load: async () => ({ ...monitor }) }));
  try {
    const connector = await registry.get('elegoo');
    await connector.read(machine); await setImmediate();
    let state = await connector.control.read(machine);
    assert.deepEqual(state.lights, [{ id: 'main', value: true, writable: true }]);
    assert.deepEqual(state.fans.map(({ id, percent, rpm, writable }) => [id, percent, rpm, writable]), [
      ['fan', 0, 0, true], ['aux_fan', 0, null, true], ['box_fan', 20, 900, true], ['heater_fan', 100, 8000, false], ['controller_fan', 50, null, false],
    ]);
    assert.deepEqual(await connector.control.execute(machine, { action: 'light', id: 'main', value: false }, state), { outcome: 'confirmed' });
    assert.deepEqual(commands[0].params, { power: 0 });
    state = await connector.control.read(machine);
    assert.equal(state.lights[0].value, false);
    assert.deepEqual(await connector.control.execute(machine, { action: 'fan', id: 'box_fan', value: 60 }, state), { outcome: 'confirmed' });
    assert.deepEqual(commands[1].params, { box_fan: 153 });
    state = await connector.control.read(machine);
    const box = state.fans.find(fan => fan.id === 'box_fan');
    assert.deepEqual([box.percent, box.rpm], [60, 900], 'mise à jour partielle : vitesse remplacée, rpm conservé');
    assert.equal(state.fans.length, 5, 'les autres ventilateurs restent affichés');
    assert.equal(commands.length, 2);
  } finally { registry.close(); }
});

test('HTTP : deux secondes minimum entre deux contrôles CC2, 500 ms ailleurs', async ctx => {
  const { createFabCore } = await import('./server.mjs');
  const { request } = await import('node:http');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-cc2-rate-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  const origin = 'http://fabcore.test';
  const ready = { status: 'ready', issue: null, progress: 0, nozzle: 20, bed: 20, file: '' };
  const { server, token } = createFabCore({ directory, origin, activationToken: 'cc2-rate-activation',
    readCC2: async () => ({ ...ready, serial: 'CC2RATE01' }), readPrinter: async () => ready,
    // Fixture isolation: never query the fake Moonraker private address.
    fetchFiles: async () => Response.json({ result: { objects: [] } }) });
  ctx.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const send = (path, body, cookie) => new Promise((resolve, reject) => {
    const req = request(base + path, { method: 'POST', headers: { Host: 'fabcore.test', Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk);
      resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(Buffer.concat(chunks).toString() || 'null') });
    });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
  const cookie = (await send('/api/setup', { username: 'atelier', password: 'long-enough-password', token })).headers['set-cookie'][0].split(';')[0];
  const cc2 = (await send('/api/machines', { kind: 'elegoo', name: 'CC2', host: '192.168.1.30', accessCode: 'test-only' }, cookie)).json.id;
  const voron = (await send('/api/machines', { kind: 'klipper', name: 'Voron', origin: 'http://192.168.1.20:7125' }, cookie)).json.id;
  assert.ok(cc2 && voron);
  const realNow = Date.now;
  ctx.after(() => { Date.now = realNow; });
  let clock = realNow();
  Date.now = () => clock;
  const control = id => send(`/api/machines/${id}/controls`, { action: 'light', id: 'main', value: true, confirm: true }, cookie);
  assert.notEqual((await control(cc2)).status, 429);
  clock += 600;
  assert.deepEqual((await control(cc2)).json, { error: 'rate' }, 'CC2 : 600 ms trop tôt');
  clock += 1500;
  assert.notEqual((await control(cc2)).status, 429, 'CC2 : accepté après deux secondes');
  assert.notEqual((await control(voron)).status, 429);
  clock += 600;
  assert.notEqual((await control(voron)).status, 429, 'Klipper : 500 ms inchangés');
});

test('CC2 : position et origine conservées depuis la session, ancien nom gcode_move_inf accepté', async () => {
  const machine = { id: 'cc2b', kind: 'elegoo', serial: 'CC2MOVE01', origin: 'mqtt://192.168.1.3:1883', accessCode: 'test-only' };
  const client = new EventEmitter(); client.connected = true;
  let response;
  const commands = [];
  const deliver = (topic, data) => client.emit('message', topic, Buffer.from(JSON.stringify(data)), { retain: false });
  const push = result => deliver(`elegoo/${machine.serial}/api_status`, { method: 6000, result });
  client.subscribe = (_topics, done) => done(null, [{ qos: 0 }, { qos: 0 }, { qos: 0 }]);
  client.end = () => {};
  client.publish = (topic, payload, options, callback) => {
    const data = JSON.parse(payload);
    if (topic.endsWith('/api_register')) deliver(`elegoo/${machine.serial}/${data.request_id}/register_response`, { error: 'ok' });
    else if (data.method === 1002) deliver(response, { id: data.id, method: 1002, result: { machine_status: { status: 1 }, extruder: { temperature: 22, target: 0 }, gcode_move_inf: { x: 10, y: 20, z: 30 }, toolhead: { homed_axes: 'xyz' } } });
    else if (data.method === 1027) {
      commands.push(data); callback();
      queueMicrotask(() => { deliver(response, { id: data.id, method: 1027, result: { error_code: 0 } }); push({ gcode_move: { [data.params.axes]: 30 + data.params.distance } }); });
    }
  };
  const monitor = createElegooMonitor({ fetcher: async () => Response.json({ system_info: { sn: machine.serial } }),
    connectPrinter(_url, options) { response = `elegoo/${machine.serial}/${options.clientId}/api_response`; queueMicrotask(() => client.emit('connect')); return client; } });
  const registry = createConnectorRegistry({}, () => ({ controls: true, load: async () => ({ ...monitor }) }));
  try {
    const connector = await registry.get('elegoo');
    await connector.read(machine); await setImmediate();
    const state = await connector.control.read(machine);
    assert.deepEqual([state.motion.homed, state.motion.position], ['xyz', [10, 20, 30]]);
    assert.deepEqual(await connector.control.execute(machine, { action: 'move', axis: 'Z', distance: 10 }, state), { outcome: 'confirmed' });
    assert.deepEqual(commands.map(command => command.params), [{ axes: 'z', distance: 10 }]);
    assert.deepEqual((await connector.control.read(machine)).motion.position, [10, 20, 40], 'X et Y conservés lors d’une mise à jour partielle');
  } finally { registry.close(); }
});
