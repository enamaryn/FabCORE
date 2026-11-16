import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { readXTool } from './xtool.mjs';

test('M2 lit son identité et son état, et refuse un certificat différent', async () => {
  const requests = [];
  class MockSocket extends EventEmitter {
    constructor(url) {
      super();
      assert.equal(url.host, '192.168.1.12:28900');
      assert.equal(url.pathname, '/websocket');
      queueMicrotask(() => {
        this.emit('upgrade', { socket: { getPeerCertificate: () => ({ fingerprint256: 'AA:BB' }) } });
        this.emit('open');
      });
    }

    send(frame) {
      assert.equal(frame.readUInt16BE(), 0xBABE);
      assert.equal(frame.readUIntBE(2, 3), frame.length - 10);
      const { method, url, transactionId } = JSON.parse(frame.subarray(10));
      requests.push([method, url]);
      const data = transactionId === 2 ? { sn: 'M2-123456' } : { curMode: { mode: 'Idle' } };
      queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({
        type: 'response', code: 0, transactionId, data
      })), false));
    }

    terminate() {}
  }

  const machine = { origin: 'wss://192.168.1.12:28900' };
  const status = await readXTool(machine, { Socket: MockSocket });
  assert.equal(status.status, 'ready');
  assert.equal(status.serial, 'M2-123456');
  assert.equal(status.fingerprint, 'AA:BB');
  const rejected = await readXTool({ ...machine, fingerprint: 'CC:DD' }, { Socket: MockSocket });
  assert.equal(rejected.issue, 'xtool-identity');
  assert.deepEqual(requests, [
    ['GET', '/v1/user/parity'],
    ['GET', '/v1/platform/device/machine-info'],
    ['POST', '/v1/platform/device/state/sync']
  ]);
});
