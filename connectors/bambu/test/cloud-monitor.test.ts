import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { MqttClient } from 'mqtt';
import { createCloudMonitor } from '../src/cloud-monitor.ts';

function setup(refused = false) {
  let time = 1000; const reports: Record<string, unknown>[] = [];
  const sent: { topic: string; payload: unknown; options: unknown }[] = [];
  const client = Object.assign(new EventEmitter(), {
    options: { reconnectPeriod: 10000 }, ends: 0,
    subscribe(topics: string[], _opts: unknown, cb: (error: null, grants: { qos: number }[]) => void) { cb(null, topics.map(() => ({ qos: refused ? 128 : 0 }))); },
    publish(topic: string, body: string, options: unknown, done: () => void) { sent.push({ topic, payload: JSON.parse(body), options }); done(); },
    end() { client.ends++; },
  });
  const monitor = createCloudMonitor({ account: { region: 'china', devices: [{ serial: 'ONE' }] }, token: 'SECRET', username: 'u_1',
    connectMqtt: (url, opts) => {
      assert.equal(url, 'mqtts://cn.mqtt.bambulab.com:8883'); assert.equal(opts.rejectUnauthorized, true);
      assert.equal(opts.password, 'SECRET'); return client as unknown as MqttClient;
    }, now: () => time, log() { throw new Error('storage failure'); },
    reportedControls: (_kind, report) => { reports.push(report); return { heaters: [{ id: 'bed', current: report.bed_temper }] }; },
    bambuFilaments: () => [{ id: 0 }],
  });
  const report = (value: unknown, serial = 'ONE') => client.emit('message', 'device/' + serial + '/report', Buffer.from(JSON.stringify(value)));
  return { client, monitor, report, reports, sent, advance(ms: number) { time += ms; } };
}

test('Cloud MQTT autonome : allowlist, fusion des deltas AMS/tray, fraîcheur et demandes seules sans rafale', () => {
  const { client, monitor, report, reports, sent, advance } = setup();
  client.emit('connect');
  assert.deepEqual(sent.map(item => item.payload), [
    { pushing: { sequence_id: '91001', command: 'pushall', version: 1, push_target: 1 } },
    { info: { sequence_id: '91002', command: 'get_version' } },
  ]);
  assert.ok(sent.every(item => item.topic === 'device/ONE/request'));
  assert.ok(sent.every(item => JSON.stringify(item.options) === '{"qos":0,"retain":false}'));
  report({ print: { bed_temper: 20, ams: { ams: [{ id: '0', temp: '26', tray: [{ id: '0', tray_type: 'PETG' }] }] } } });
  report({ print: { ams: { ams: [{ id: '0', tray: [{ id: '0', tray_color: 'FFFFFFFF' }] }] } } });
  report({ print: { bed_temper: 99 } }, 'FOREIGN');
  let device = monitor.snapshot().devices[0]!;
  assert.equal(device.heaters[0]?.current, 20); assert.equal(device.filaments[0]?.temperature, 26);
  assert.deepEqual(reports.at(-1)?.ams, { ams: [{ id: '0', temp: '26', tray: [{ id: '0', tray_type: 'PETG', tray_color: 'FFFFFFFF' }] }] });
  advance(60001); device = monitor.snapshot().devices[0]!;
  assert.equal(device.stale, true); assert.deepEqual(device.heaters, []);
  client.emit('close'); client.emit('connect'); assert.equal(sent.length, 2);
  advance(300000); client.emit('connect'); assert.equal(sent.length, 4);
  monitor.close(); report({ print: { bed_temper: 88 } });
  assert.equal(monitor.snapshot().status, 'disconnected'); assert.equal(client.options.reconnectPeriod, 0);
});

test('Cloud MQTT autonome : refus abonnement et authentification ne publient pas de nouvelles requêtes', () => {
  const denied = setup(true); denied.client.emit('connect');
  assert.equal(denied.monitor.snapshot().issue, 'cloud-access'); assert.equal(denied.sent.length, 0); denied.monitor.close();
  for (const code of [4, 5, 134, 135]) {
    const { client, monitor, sent } = setup();
    client.emit('error', { code });
    assert.equal(monitor.snapshot().issue, 'cloud-auth'); assert.equal(client.options.reconnectPeriod, 0);
    assert.equal(client.ends, 1); assert.equal(sent.length, 0); monitor.close();
  }
});


test('Cloud P2S : ancien FAILED sans erreur active devient IDLE, sans effacer les erreurs réelles', () => {
  const { client, monitor, report, advance } = setup();
  try {
    client.emit('connect');
    report({ print: { command: 'push_status', gcode_state: 'FAILED', mc_percent: 37, subtask_name: 'old-job' } });
    assert.equal(monitor.snapshot().devices[0]!.state, 'FAILED', 'absence de code ≠ erreur effacée');
    report({ print: { print_error: 1234 } });
    assert.equal(monitor.snapshot().devices[0]!.state, 'FAILED', 'erreur active conservée');
    report({ print: { print_error: 0 } });
    const cleared = monitor.snapshot().devices[0]!;
    assert.equal(cleared.state, 'IDLE');
    assert.equal(cleared.progress, 0);
    assert.equal(cleared.file, '');
    report({ print: { gcode_state: 'RUNNING', print_error: 0, mc_percent: 12, subtask_name: 'current-job' } });
    assert.equal(monitor.snapshot().devices[0]!.state, 'RUNNING');
    assert.equal(monitor.snapshot().devices[0]!.file, 'current-job');
    report({ print: { gcode_state: 'FAILED', print_error: 99 } });
    assert.equal(monitor.snapshot().devices[0]!.state, 'FAILED');
    advance(60001);
    assert.equal(monitor.snapshot().devices[0]!.state, null, 'aucun état prêt depuis un rapport périmé');
  } finally { monitor.close(); }
});
