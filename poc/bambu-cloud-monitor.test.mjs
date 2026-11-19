import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createCloudMonitor } from './bambu-cloud-monitor.mjs';

function setup() {
  const client = new EventEmitter(); client.options = {}; client.sent = []; client.ends = 0;
  client.subscribe = (topics, opts, cb) => cb(null, topics.map(topic => ({ topic, qos: 0 })));
  client.publish = (topic, body, options, cb) => { client.sent.push({ topic, body: JSON.parse(body), options }); cb(); };
  client.end = () => { client.ends++; };
  let time = 1000; const logs = [];
  const monitor = createCloudMonitor({ account: { region: 'global', devices: [{ serial: 'TEST' }] }, token: 'PRIVATE', username: 'u_1',
    connectMqtt: (url, options) => { assert.equal(url, 'mqtts://us.mqtt.bambulab.com:8883'); assert.equal(options.rejectUnauthorized, true); return client; },
    now: () => time, log: (...args) => logs.push(args) });
  const report = value => client.emit('message', 'device/TEST/report', Buffer.from(JSON.stringify(value)));
  return { client, monitor, report, logs, advance: value => { time += value; } };
}
test('cloud MQTT : demandes de lecture seules, rapports partiels, plateau, AMS et modules', () => {
  const { client, monitor, report } = setup(); client.emit('connect');
  assert.equal(client.sent.length, 2);
  assert.deepEqual(client.sent.map(item => Object.values(item.body)[0].command), ['pushall', 'get_version']);
  assert.ok(client.sent.every(item => item.options.qos === 0 && item.options.retain === false));
  report({ print: { nozzle_temper: 23, bed_temper: 20, ams: { tray_exist_bits: '1', ams_exist_bits: '1', ams: [{ id: '0', humidity_raw: '28', temp: '26.4', tray: [{ id: '0', tray_type: 'PETG', tray_color: 'FFFFFFFF' }] }] } } });
  report({ info: { command: 'get_version', module: [{ name: 'n3f/0', product_name: 'AMS 2 Pro', sn: 'AMS_SERIAL', sw_ver: '1' }] } });
  report({ print: { nozzle_temper: 24, ams: { ams: [{ id: '0', humidity_raw: '29' }] } } });
  const data = monitor.snapshot().devices[0];
  assert.equal(data.heaters[0].current, 24); assert.equal(data.heaters[1].current, 20);
  assert.equal(data.filaments[0].temperature, 26.4); assert.equal(data.filaments[0].humidity, 29); assert.equal(data.filaments[0].slots[0].material, 'PETG');
  assert.equal(data.filaments[0].slots[0].color, '#FFFFFF'); assert.equal(data.modules[0].serial, 'AMS_SERIAL');
  client.emit('message', 'device/OTHER/report', Buffer.from('{"print":{"bed_temper":99}}'));
  assert.equal(monitor.snapshot().devices[0].heaters[1].current, 20); monitor.close();
});
test('cloud MQTT : expiration, reconnexion sans rafale, fermeture et refus authentification', () => {
  const { client, monitor, report, advance } = setup(); client.emit('connect');
  report({ print: { bed_temper: 20 } }); advance(60001);
  assert.equal(monitor.snapshot().devices[0].stale, true); assert.deepEqual(monitor.snapshot().devices[0].heaters, []);
  client.emit('close'); client.emit('connect'); assert.equal(client.sent.length, 2);
  advance(300000); client.emit('connect'); assert.equal(client.sent.length, 4);
  client.emit('error', { code: 5 }); assert.equal(monitor.snapshot().issue, 'cloud-auth'); assert.equal(client.options.reconnectPeriod, 0);
  monitor.close(); report({ print: { bed_temper: 80 } }); assert.equal(monitor.snapshot().status, 'disconnected');
});
