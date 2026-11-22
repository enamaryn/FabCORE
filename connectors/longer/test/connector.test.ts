import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRay5Services } from '../src/monitor.ts';
import { createRay5FileServices } from '../src/files.ts';

const machine = { id: 'ray-test', origin: 'tcp://192.168.1.42:8080' };
class Socket extends EventEmitter {
  sent: (string | Buffer)[] = []; destroyed = false;
  write(data: string | Buffer) { this.sent.push(data); }
  destroy() { this.destroyed = true; }
}
const services = createRay5Services({ privateIPv4: host => host.startsWith('192.168.1.'), openWS: () => assert.fail('Pas de WS en TCP') });

test('Ray5 : perte pendant M5 reste inconnue, reconnexion sans commande rejouée ni paramètres anciens', async ctx => {
  let clock = Date.now(); const sockets: Socket[] = [];
  const monitor = services.createRay5Monitor({ now: () => clock, connectTCP: () => { const s = new Socket(); sockets.push(s); return s; }, pollMs: 10000 });
  ctx.after(() => monitor.close());
  monitor.read(machine); const first = sockets[0]!; first.emit('connect');
  first.emit('data', Buffer.from('ok\n$22=1\n$30=1000\n$32=1\n<Idle|FS:0,0>\n'));
  const pending = monitor.control.execute(machine, { action: 'laser-off' });
  first.emit('close'); await assert.rejects(pending, /command-unconfirmed/);
  assert.equal(monitor.read(machine).status, 'offline');
  clock += 3100; monitor.read(machine); const next = sockets[1]!;
  next.emit('connect'); next.emit('data', Buffer.from('ok\n<Idle|FS:0,0>\n'));
  assert.deepEqual(next.sent, ['$I\n', '?']);
  assert.equal(first.sent.filter(x => x === 'M5\n').length, 1);
  const settings = monitor.control.read(machine); next.emit('data', Buffer.from('ok\n'));
  const controls = await settings;
  assert.equal(controls.laser?.max, null); assert.equal(controls.motion?.home, false);
  monitor.forget(machine.id); assert.equal(next.destroyed, true);
  next.emit('data', Buffer.from('<Run|FS:100,100>\n'));
  monitor.close(); assert.equal(monitor.read(machine).status, 'error');
});

test('Ray5 : garde la séparation transport TCP/ESP3D et refuse une origine publique', () => {
  assert.equal(services.ray5Target({ ...machine, origin: 'tcp://8.8.8.8:8080' }), null);
  assert.equal(services.ray5Target({ ...machine, origin: 'http://192.168.1.42:8848', wsPort: 0 }), null);
  assert.equal(services.parseRay5Status('<Hold:1|FS:0,10>')?.nativeState, 'Hold:1');
  assert.equal(services.parseRay5Status('<Idle|MPos:1,2,3|FS:0,0>')?.machinePosition?.z, 3);
  assert.equal(services.parseRay5Status('ok'), null);
});

test('Ray5 SD : refus hors repos et erreur de vérification après upload ne lancent ni ne rejouent', async () => {
  let idle = false, uploads = 0, starts = 0;
  const { createRay5Files } = createRay5FileServices({ ray5Target: services.ray5Target, readResponse: response => response.json() as Promise<unknown> });
  assert.deepEqual(Object.keys(createRay5Files()), ['list', 'download', 'upload', 'start']);
  const files = createRay5Files({ read: () => ({ nativeState: idle ? 'Idle' : 'Run' }), fetcher: async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (path === '/command') starts++;
    if (options?.method === 'POST') { uploads++; return Response.json({ status: 'Ok', files: [{ name: 'a.gc' }] }); }
    if (path === '/upload') return Response.json({ status: 'Ok', files: [] });
    return new Response('G1 X999\n');
  } });
  await assert.rejects(files.list(machine), /files-unavailable/);
  idle = true;
  const content = Buffer.from('G1 X1\n');
  await assert.rejects(files.upload(machine, 'a.gc', (async function* () { yield content; })(), content.length), /upload-failed/);
  assert.equal(uploads, 1); assert.equal(starts, 0);
});

test('Ray5 : après fermeture, aucun appel tardif ne rouvre de socket', async () => {
  const sockets: Socket[] = [];
  const monitor = services.createRay5Monitor({ connectTCP: () => { const s = new Socket(); sockets.push(s); return s; }, pollMs: 10000 });
  monitor.read(machine);
  monitor.close();
  assert.equal(sockets[0]!.destroyed, true);
  assert.equal(monitor.read(machine).status, 'error', 'adresse refusée une fois fermé');
  await assert.rejects(monitor.command(machine, 'pause'), /command-unconfirmed/);
  assert.equal(sockets.length, 1);
});
