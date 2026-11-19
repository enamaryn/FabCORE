import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createBambuMonitor } from './bambu.mjs';

test('P2S lit le rapport MQTT, fusionne les mises à jour et se reconnecte sans état périmé', () => {
  const machine = { id: 'test', origin: 'mqtts://192.168.1.50:8883', serial: 'TESTP2S123', accessCode: '12345678' };
  const report = 'device/TESTP2S123/report';
  const client = new EventEmitter();
  client.subscribe = (topic, done) => {
    assert.equal(topic, report);
    done(null, [{ qos: 0 }]);
  };
  client.publish = (topic, message) => {
    assert.equal(topic, 'device/TESTP2S123/request');
    assert.deepEqual(JSON.parse(message), { pushing: { sequence_id: '0', command: 'pushall' } });
  };
  let closed = false;
  client.end = () => { closed = true; };
  const monitor = createBambuMonitor((origin, options) => {
    assert.equal(origin, machine.origin);
    assert.equal(options.username, 'bblp');
    assert.equal(options.password, machine.accessCode);
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.maxVersion, 'TLSv1.2');
    assert.equal(options.checkServerIdentity('', { subject: { CN: machine.serial } }), undefined);
    assert.ok(options.checkServerIdentity('', { subject: { CN: 'ANOTHERP2S' } }));
    return client;
  });
  const send = (payload, topic = report) => client.emit('message', topic, Buffer.from(JSON.stringify({
    print: { command: 'push_status', ...payload }
  })));

  assert.equal(monitor.read(machine).status, 'connecting');
  client.emit('connect');
  send({ gcode_state: 'RUNNING', nozzle_temper: 254, bed_temper: 70, mc_percent: 64, subtask_name: 'Pièce' });
  const { checkedAt, ...telemetry } = monitor.read(machine);
  assert.ok(checkedAt);
  assert.deepEqual(telemetry, { status: 'printing', issue: null, nozzle: 254, bed: 70, progress: 64, file: 'Pièce' });
  send({ mc_percent: 65 });
  send({ mc_percent: 99 }, 'device/other/report');
  assert.equal(monitor.read(machine).progress, 65);
  assert.equal(monitor.read(machine).nozzle, 254);
  send({ ams: { ams: [{ id: '0', humidity_raw: '34', tray: [{ id: '0', tray_type: 'PETG', tray_color: '44AA11FF' }] }],
    tray_exist_bits: '1', tray_now: '0' } });
  let slots = monitor.read(machine).filaments[0].slots;
  assert.deepEqual(slots[0], { id: 0, occupied: true, active: true, material: 'PETG', name: '', color: '#44AA11' });
  assert.equal(slots[3].occupied, false);
  assert.equal(monitor.read(machine).filaments[0].humidity, 34);
  send({ ams: { ams: [{ id: '0', humidity_raw: '29' }] } });
  assert.equal(monitor.read(machine).filaments[0].humidity, 29);
  assert.equal(monitor.read(machine).filaments[0].slots[0].color, '#44AA11', 'une mesure ne supprime pas les bobines');
  send({ ams: { ams: [{ id: '0', tray: [{ id: '0', tray_type: 'PLA' }] }] } });
  assert.equal(monitor.read(machine).filaments[0].humidity, 29, 'une mise à jour de bobine conserve la mesure');
  send({ ams: { tray_exist_bits: '0' } });
  slots = monitor.read(machine).filaments[0].slots;
  assert.equal(slots[0].occupied, false);
  assert.equal(slots[0].color, null);
  send({ ams: { ams: [], tray_now: '255' } });
  send({ gcode_state: 'FAILED', print_error: 1234 });
  assert.equal(monitor.read(machine).issue, 'bambu-print');
  send({ print_error: 0 });
  const { checkedAt: clearedAt, ...cleared } = monitor.read(machine);
  assert.ok(clearedAt);
  assert.deepEqual(cleared, { status: 'ready', issue: null, nozzle: 254, bed: 70, progress: 0, file: '', filaments: [] });
  client.emit('close');
  assert.equal(monitor.read(machine).status, 'offline');
  client.emit('connect');
  send({ gcode_state: 'IDLE' });
  assert.equal(monitor.read(machine).status, 'ready');
  assert.equal(monitor.read(machine).nozzle, null);
  assert.equal(monitor.read(machine).filaments, undefined);
  monitor.close();
  assert.ok(closed);
});

test('P2S : lumière sur le canal system, accusé corrélé et session MQTT unique', async () => {
  const client = new EventEmitter(); client.connected = true;
  client.subscribe = (_topic, callback) => callback(null, [{ qos: 0 }]); client.end = () => {};
  const topic = 'device/TESTP2S123/report';
  const packets = [];
  client.publish = (_topic, payload, options, callback) => {
    const packet = JSON.parse(payload);
    if (!packet.system) return;
    packets.push(packet); callback();
    assert.deepEqual(options, { qos: 0, retain: false });
    queueMicrotask(() => {
      client.emit('message', topic, Buffer.from(JSON.stringify({ print: { ...packet.system, result: 'fail' } })));
      client.emit('message', topic, Buffer.from(JSON.stringify({ system: { ...packet.system, result: 'success' } })));
    });
  };
  let connections = 0;
  const monitor = createBambuMonitor(() => { connections++; return client; });
  const machine = { id: 'one', origin: 'mqtts://192.168.1.2:8883', serial: 'TESTP2S123', accessCode: '12345678' };
  try {
    monitor.read(machine); client.emit('connect');
    client.emit('message', topic, Buffer.from(JSON.stringify({ print: { command: 'push_status', gcode_state: 'IDLE', lights_report: [{ node: 'chamber_light', mode: 'off' }] } })));
    assert.equal(await monitor.send(machine, 'ledctrl', { led_node: 'chamber_light', led_mode: 'on' }, 'system'), true);
    assert.equal(packets.length, 1); assert.equal(connections, 1);
    assert.equal(monitor.controlState(machine).lights[0].value, false, 'seul le rapport fait foi');
  } finally { monitor.close(); }
});

test('P2S : températures compactes et rapports imbriqués partiels sans perte des consignes', () => {
  const client = new EventEmitter(); client.subscribe = (_t, cb) => cb(null, [{ qos: 0 }]); client.publish = () => {}; client.end = () => {};
  const monitor = createBambuMonitor(() => client);
  const machine = { id: 'packed', serial: 'TEST', origin: 'mqtts://192.168.1.2:8883' };
  const push = delta => client.emit('message', 'device/TEST/report', Buffer.from(JSON.stringify({ print: { command: 'push_status', ...delta } })));
  try {
    monitor.read(machine); client.emit('connect');
    push({ gcode_state: 'IDLE', device: { bed: { info: { temp: (60 << 16) + 21 } }, extruder: { info: [{ id: 0, temp: (200 << 16) + 23 }] } } });
    assert.equal(monitor.read(machine).nozzle, 23); assert.equal(monitor.read(machine).bed, 21);
    push({ device: { bed: { info: { other: 1 } } } });
    assert.equal(monitor.controlState(machine).heaters[1].target, 60);
    assert.equal(monitor.controlState(machine).heaters[0].target, 200);
    push({ device: { bed: { info: { temp: 22 } } } });
    assert.equal(monitor.controlState(machine).heaters[1].target, 0);
    client.emit('close'); assert.equal(monitor.controlState(machine), undefined);
  } finally { monitor.close(); }
});
