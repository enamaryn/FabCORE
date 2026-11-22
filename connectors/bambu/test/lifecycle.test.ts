import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { MqttClient } from 'mqtt';
import { createP2SMonitor } from '../src/monitor.ts';

const machine = (id: string, host: string) => ({ id, origin: `mqtts://${host}:8883`, serial: 'P2S' + id, accessCode: '12345678' });
class Client extends EventEmitter {
  connected = true;
  published: { topic: string; body: Record<string, Record<string, unknown>> }[] = [];
  ended = 0;
  origin: string;
  constructor(origin: string) { super(); this.origin = origin; }
  subscribe(_topic: string, done: (error: Error | null, grants: { qos: number }[]) => void) { done(null, [{ qos: 0 }]); }
  publish(topic: string, message: string, _options?: unknown, done?: (error?: Error) => void) { this.published.push({ topic, body: JSON.parse(message) }); done?.(); }
  end() { this.ended += 1; this.connected = false; }
  report(serial: string, print: Record<string, unknown>) { this.emit('message', `device/${serial}/report`, Buffer.from(JSON.stringify({ print: { command: 'push_status', ...print } }))); }
  commands() { return this.published.filter(({ body }) => body.print && body.print.command !== 'pushall' && 'sequence_id' in body.print); }
}
function harness() {
  const clients: Client[] = [];
  const monitor = createP2SMonitor({
    ca: Buffer.from(''),
    reportedControls: (_kind, report) => ({ heaters: [{ id: 'nozzle', current: report.nozzle_temper }, { id: 'bed', current: report.bed_temper }] }),
    bambuFilaments: () => null,
    connectPrinter: origin => { const client = new Client(origin); clients.push(client); return client as unknown as MqttClient; },
  });
  return { monitor, clients };
}

test('P2S : deux machines gardent des sessions, topics et états séparés', async () => {
  const { monitor, clients } = harness();
  const a = machine('A', '192.168.1.50'), b = machine('B', '192.168.1.51');
  monitor.read(a); monitor.read(b); monitor.read(a);
  assert.equal(clients.length, 2, 'une session MQTT par machine, réutilisée');
  const [ca, cb] = clients as [Client, Client];
  ca.emit('connect'); cb.emit('connect');
  ca.report(a.serial, { gcode_state: 'RUNNING', nozzle_temper: 220, mc_percent: 40 });
  cb.report(b.serial, { gcode_state: 'IDLE', nozzle_temper: 25 });
  ca.report(b.serial, { gcode_state: 'FAILED', print_error: 1 });
  assert.equal(monitor.read(a).status, 'printing');
  assert.equal(monitor.read(b).status, 'ready', 'un rapport reçu sur une autre session est ignoré');
  assert.equal(monitor.read(b).nozzle, 25);
  void (monitor.command(a, 'pause') as Promise<boolean>).catch(() => {});
  assert.equal(ca.commands().length, 1);
  assert.equal(cb.commands().length, 0, 'la commande ne part que vers sa machine');
  monitor.forget(a.id);
  assert.equal(ca.ended, 1);
  assert.equal(cb.ended, 0, 'oublier une machine ne ferme pas les autres');
  monitor.close();
});

test('P2S : reconnexion sans état périmé et sans renvoi de la commande en attente', async () => {
  const { monitor, clients } = harness();
  const a = machine('A', '192.168.1.50');
  monitor.read(a);
  const client = clients[0]!;
  client.emit('connect');
  client.report(a.serial, { gcode_state: 'RUNNING', nozzle_temper: 220, mc_percent: 40, subtask_name: 'cube' });
  const pending = monitor.command(a, 'pause') as Promise<boolean>;
  client.emit('close');
  assert.equal(monitor.read(a).status, 'offline');
  await assert.rejects(monitor.command(a, 'resume') as Promise<boolean>, /bambu-connection/, 'aucune commande sans rapport frais');
  client.emit('connect');
  const reconnected = monitor.read(a);
  assert.equal(reconnected.status, 'connecting');
  assert.equal(reconnected.nozzle, null, 'aucune température de la session précédente');
  assert.equal(reconnected.file, '');
  assert.equal(client.commands().length, 1, 'la commande perdue n’est jamais republiée');
  client.report(a.serial, { gcode_state: 'PAUSE' });
  assert.equal(monitor.read(a).status, 'paused');
  assert.equal(monitor.read(a).nozzle, null, 'les températures viennent du nouveau rapport seulement');
  monitor.close();
  await assert.rejects(pending, /command-unconfirmed/);
});

test('P2S : après fermeture, aucun appel tardif ne rouvre de session', async () => {
  const { monitor, clients } = harness();
  const a = machine('A', '192.168.1.50');
  monitor.read(a);
  monitor.close();
  assert.equal(clients[0]!.ended, 1);
  assert.deepEqual({ ...monitor.read(a), checkedAt: null }, { status: 'offline', issue: 'bambu-connection', nozzle: null, bed: null, progress: 0, file: '', checkedAt: null });
  await assert.rejects(monitor.command(a, 'pause') as Promise<boolean>, /bambu-connection/);
  await assert.rejects(monitor.send(a, 'gcode_line', { param: 'M105' }), /bambu-connection/);
  assert.deepEqual(await monitor.probe(a), { ok: false, issue: 'bambu-connection' });
  assert.equal(clients.length, 1, 'aucune nouvelle connexion MQTT');
});
