import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createXToolServices } from '../src/monitor.ts';

const machine = { id: 'm2', origin: 'wss://192.168.1.12:28900', serial: 'M2TEST01', fingerprint: 'AA:BB' };

test('M2 : après fermeture, aucun appel tardif ne rouvre de WebSocket', async () => {
  let sockets = 0, terminated = 0;
  class Socket extends EventEmitter {
    constructor() { super(); sockets += 1; }
    send() {}
    terminate() { terminated += 1; this.emit('close'); }
  }
  const { createXToolMonitor } = createXToolServices({
    Socket, privateIPv4: host => host === '192.168.1.12',
    async snapshotXToolCamera() { return Buffer.from(''); }, async streamXToolCamera() { return undefined; },
  });
  const monitor = createXToolMonitor();
  monitor.read(machine);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(sockets, 1);
  monitor.close();
  assert.equal(terminated, 1, 'la session ouverte est fermée');
  assert.deepEqual(monitor.read(machine), { status: 'offline', issue: 'xtool-connection', nozzle: null, bed: null, progress: 0, file: '' });
  assert.equal(await monitor.command(machine, 'pause'), false, 'aucune commande sans session');
  assert.equal(sockets, 1, 'pas de nouvelle WebSocket');
});
