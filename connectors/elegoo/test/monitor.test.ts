import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import type { MqttClient } from 'mqtt';
import { createCC2Services } from '../src/monitor.ts';
import type { CC2Machine, CC2Message, CC2Options } from '../src/types.ts';

const services = () => createCC2Services({
  readResponse: async response => response.json() as Promise<unknown>,
  reportedControls: (_kind, report) => ({ nozzle: report.extruder?.temperature ?? null }),
  canvasFilaments: () => null,
});
const machine = (id: string): CC2Machine => ({ id, serial: 'CC2TEST' + id, origin: 'mqtt://192.168.1.60:1883', accessCode: 'test-only' });
interface Sent { topic: string; data: CC2Message & { params?: Record<string, unknown>; request_id?: string }; options?: { qos: number; retain: boolean } }
class Printer extends EventEmitter {
  connected = true;
  ended = false;
  sent: Sent[] = [];
  root: string;
  response: string;
  constructor(m: CC2Machine, clientId: string) {
    super(); this.root = 'elegoo/' + m.serial; this.response = this.root + '/' + clientId + '/api_response';
    queueMicrotask(() => this.emit('connect'));
  }
  deliver(topic: string, data: CC2Message, retain = false) { this.emit('message', topic, Buffer.from(JSON.stringify(data)), { retain }); }
  subscribe(topics: string[], done: (error: Error | null, grants: { qos: number }[]) => void) { done(null, topics.map(() => ({ qos: 0 }))); }
  publish(topic: string, payload: string, options?: Sent['options'], done?: (error?: Error) => void) {
    const data = JSON.parse(payload) as Sent['data'];
    this.sent.push({ topic, data, ...(options ? { options } : {}) }); done?.();
    if (topic.endsWith('/api_register')) queueMicrotask(() => this.deliver(this.root + '/' + data.request_id + '/register_response', { error: 'ok' }));
    else if (data.method === 1002) queueMicrotask(() => this.deliver(this.response, { id: 1, result: { machine_status: { status: 1 }, extruder: { temperature: 23 } } }));
  }
  end() { this.ended = true; this.connected = false; this.emit('close'); }
}
function options(clients: Printer[], m: CC2Machine): CC2Options {
  return {
    fetcher: () => Promise.resolve(Response.json({ system_info: { sn: m.serial } })),
    // Ce faux n'implémente que la surface MQTT exercée ; aucun socket réel.
    connectPrinter: (_origin, config) => { const p = new Printer(m, String(config.clientId)); clients.push(p); return p as unknown as MqttClient; },
  };
}

test('CC2 typé : isolation, session unique et corrélation 1044 sans rejeu', async ctx => {
  const api = services(), clients: Printer[] = [], a = machine('A'), b = machine('B');
  b.origin = 'mqtt://192.168.1.61:1883';
  const monitor = api.createElegooMonitor({
    fetcher: input => Promise.resolve(Response.json({ system_info: { sn: new URL(String(input)).hostname === '192.168.1.60' ? a.serial : b.serial } })),
    connectPrinter: (origin, config) => { const p = new Printer(origin === a.origin ? a : b, String(config.clientId)); clients.push(p); return p as unknown as MqttClient; },
  });
  ctx.after(() => monitor.close());
  await monitor.read(a); await monitor.read(b); await setImmediate();
  await monitor.read(a); assert.equal(clients.length, 2);
  const first = clients[0]!, second = clients[1]!;
  assert.notEqual(first.response, second.response);
  first.deliver(first.response, { method: 6000, result: { extruder: { temperature: 201 } } });
  const readA = await monitor.read(a), readB = await monitor.read(b);
  assert.equal('nozzle' in readA && readA.nozzle, 201);
  assert.equal('nozzle' in readB && readB.nozzle, 23);
  const pending = monitor.queryFiles(a); let resolved = false;
  void pending.then(() => { resolved = true; });
  const command = first.sent.at(-1)!;
  assert.equal(command.data.method, 1044);
  assert.deepEqual(command.data.params, { storage_media: 'local', path: '/' });
  assert.deepEqual(command.options, { qos: 0, retain: false });
  const id = command.data.id!;
  first.deliver(first.response, { id, method: 1020, result: { error_code: 0 } });
  first.deliver(second.response, { id, method: 1044, result: { error_code: 0 } });
  first.deliver(first.response, { id, method: 1044, result: { error_code: 0 } }, true);
  await setImmediate(); assert.equal(resolved, false);
  const result = { error_code: 0, file_list: [{ filename: 'demo.gcode' }] };
  first.deliver(first.response, { id, method: 1044, result });
  assert.deepEqual(await pending, result);
  assert.equal(first.sent.filter(s => s.data.method === 1044).length, 1);
  assert.equal(second.sent.some(s => s.data.method === 1044), false);
});

test('CC2 typé : pause/stop natifs, reprise absente, refus et fermeture sans rejeu', async ctx => {
  const api = services(), clients: Printer[] = [], m = machine('A');
  const monitor = api.createElegooMonitor(options(clients, m)); ctx.after(() => monitor.close());
  await monitor.read(m); await setImmediate(); const p = clients[0]!;
  assert.equal(monitor.command(m, 'resume'), false);
  for (const [action, method] of [['pause', 1021], ['stop', 1022]] as const) {
    const pending = monitor.command(m, action);
    const request = p.sent.at(-1)!;
    assert.equal(request.data.method, method);
    p.deliver(p.response, { id: request.data.id!, method, result: { error_code: 1003 } });
    assert.equal(await pending, false);
    assert.equal(p.sent.filter(s => s.data.method === method).length, 1);
  }
  const files = monitor.queryFiles(m), heat = monitor.request(m, 1028, { target: 100 });
  const filesRejected = assert.rejects(files, /command-unconfirmed/);
  const heatRejected = assert.rejects(heat, /command-unconfirmed/);
  monitor.forget(m.id);
  await Promise.all([filesRejected, heatRejected]); assert.equal(p.ended, true);
  assert.throws(() => monitor.queryFiles(m), /elegoo-connection/);
});

test('CC2 typé : une identification en attente ne rouvre pas une machine supprimée', async () => {
  const api = services(), m = machine('A'); let opened = 0;
  let finish!: (value: Response) => void;
  const response = new Promise<Response>(resolve => { finish = resolve; });
  const monitor = api.createElegooMonitor({ fetcher: () => response, connectPrinter: () => { opened++; throw new Error('unexpected connection'); } });
  await monitor.read(m); monitor.forget(m.id);
  finish(Response.json({ system_info: { sn: m.serial } })); await setImmediate();
  assert.equal(opened, 0); monitor.close();
});

test('CC2 typé : identité différente refusée avant MQTT et identifiant stable', async () => {
  const api = services(), m = machine('A'); let opened = false;
  const read = await api.readElegoo(m, { fetcher: () => Promise.resolve(Response.json({ system_info: { sn: 'OTHERCC2' } })), connectPrinter: () => { opened = true; throw new Error('unexpected'); } });
  assert.equal('issue' in read && read.issue, 'elegoo-identity'); assert.equal(opened, false);
  assert.equal(api.elegooClientId(m.serial), services().elegooClientId(m.serial));
});
