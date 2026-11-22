import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createXToolServices } from '../src/monitor.ts';
import type { XToolPorts, XToolSocketOptions } from '../src/types.ts';

const machine = { id: 'm2', origin: 'wss://192.168.1.12:28900', serial: 'M2TEST01', fingerprint: 'AA:BB' };
interface Request { method: string; url: string; transactionId: number; params: Record<string, unknown>; sessionToken?: string }
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function harness(overrides: Partial<XToolPorts> = {}) {
  const requests: Request[] = [];
  const sockets: Socket[] = [];
  let mode: 'ok' | 'refused' | 'missing-code' | 'lost' = 'ok';
  let closed = 0;
  class Socket extends EventEmitter {
    constructor(url: URL, options: XToolSocketOptions) {
      super();
      sockets.push(this);
      assert.equal(url.pathname, '/websocket');
      assert.equal(url.searchParams.get('function'), 'instruction');
      assert.deepEqual(options, { rejectUnauthorized: false, followRedirects: false,
        origin: 'atomm://renderer', handshakeTimeout: 4000, maxPayload: 65536 });
      queueMicrotask(() => {
        this.emit('upgrade', { socket: { getPeerCertificate: () => ({ fingerprint256: 'AA:BB' }) } });
        this.emit('open');
      });
    }
    send(frame: Buffer) {
      const request = JSON.parse(frame.subarray(10).toString()) as Request;
      requests.push(request);
      let data: unknown = {};
      let code: number | undefined = 0;
      if (request.url.endsWith('parity')) data = { sessionToken: 'session-only' };
      else assert.equal(request.sessionToken, 'session-only');
      if (request.url.endsWith('machine-info')) data = { snCode: 'M2TEST01' };
      if (request.url.endsWith('sync')) data = { curMode: { mode: 'Idle' } };
      if (request.url.endsWith('/control')) {
        assert.equal(request.method, 'POST');
        if (mode === 'lost') return;
        if (mode === 'refused') code = 409;
        if (mode === 'missing-code') code = undefined;
      }
      queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({
        type: 'response', transactionId: request.transactionId, code, data
      })), false));
    }
    terminate() { closed++; }
  }
  const ports: XToolPorts = {
    Socket,
    privateIPv4: host => host === '192.168.1.12',
    async snapshotXToolCamera() { return Buffer.from('image'); },
    async streamXToolCamera() { return undefined; },
    ...overrides
  };
  return { ...createXToolServices(ports), requests, sockets, setMode(value: typeof mode) { mode = value; }, closed: () => closed };
}

test('M2: ACK accepté, refus explicite, ACK inconnu et réponse perdue sans rejeu', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const h = harness();
  const monitor = h.createXToolMonitor();
  t.after(() => monitor.close());
  assert.equal(await monitor.command(machine, 'start'), false);
  monitor.read(machine);
  await flush();
  assert.equal(await monitor.command(machine, 'pause'), true);
  h.setMode('refused');
  assert.equal(await monitor.command(machine, 'resume'), false);
  h.setMode('missing-code');
  await assert.rejects(monitor.command(machine, 'stop'), /xtool-request/);
  h.setMode('lost');
  const lost = assert.rejects(monitor.command(machine, 'start'), /xtool-protocol/);
  t.mock.timers.tick(10_000);
  await lost;
  assert.deepEqual(h.requests.filter(item => item.url.endsWith('/control')).map(item => item.params), [
    { action: 'PAUSE' }, { action: 'RESUME' }, { action: 'CANCEL' }, { action: 'START' }
  ]);
  assert.equal(h.sockets.length, 1);
  assert.equal(await monitor.command(machine, 'laser'), false);
});

test('M2: perte de session rejette la commande en attente et attend 30 s avant reconnexion', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const h = harness();
  const monitor = h.createXToolMonitor();
  t.after(() => monitor.close());
  monitor.read(machine);
  await flush();
  h.setMode('lost');
  const lost = assert.rejects(monitor.command(machine, 'stop'), /xtool-connection/);
  h.sockets[0]!.emit('close');
  await lost;
  assert.equal(await monitor.command(machine, 'stop'), false);
  t.mock.timers.tick(29_999);
  monitor.read(machine);
  assert.equal(h.sockets.length, 1);
  t.mock.timers.tick(1);
  monitor.read(machine);
  await flush();
  assert.equal(h.sockets.length, 2);
  assert.equal(h.requests.filter(item => item.url.endsWith('/control')).length, 1);
  monitor.forget(machine.id);
  assert.equal(h.closed(), 2);
});

test('M2: empreinte et série doivent correspondre avant de superviser', async () => {
  const h = harness();
  const cert = await h.readXTool({ ...machine, fingerprint: 'NEW' });
  assert.ok('issue' in cert);
  assert.equal(cert.issue, 'xtool-identity');
  const serial = await h.readXTool({ ...machine, serial: 'OTHER01' });
  assert.ok('issue' in serial);
  assert.equal(serial.issue, 'xtool-identity');
  assert.equal(h.requests.some(item => item.url.endsWith('sync')), false);
  assert.equal(h.closed(), 2);
});

test('M2: prévisualisation réutilise la session supervisée et la vue demandée', async t => {
  const h = harness({ async snapshotXToolCamera(getSession, signal, view) {
    assert.equal(signal.aborted, false);
    assert.equal(view, 'near');
    assert.equal(getSession()?.fingerprint, 'AA:BB');
    assert.equal(getSession()?.url.searchParams.get('function'), 'instruction');
    return Buffer.from('image');
  } });
  const monitor = h.createXToolMonitor();
  t.after(() => monitor.close());
  monitor.read(machine);
  await flush();
  assert.deepEqual(await monitor.preview(machine, new AbortController().signal, 'near'), Buffer.from('image'));
  assert.equal(h.sockets.length, 1);
});

test('M2: heartbeat silencieux ferme la session après 35 s sans réponse', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1000 });
  const h = harness();
  const monitor = h.createXToolMonitor();
  t.after(() => monitor.close());
  monitor.read(machine);
  await flush();
  t.mock.timers.tick(40_000);
  const status = monitor.read(machine);
  assert.ok('issue' in status);
  assert.equal(status.issue, 'xtool-connection');
  assert.equal(h.closed(), 1);
  assert.equal(h.requests.filter(item => item.url.endsWith('/control')).length, 0);
});
