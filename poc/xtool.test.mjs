import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { readXTool } from './xtool.mjs';

test('M2 lit son identité et son état, et refuse un certificat différent', async () => {
  const requests = [];
  let authRequired = false;
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
        type: 'response', code: authRequired ? 406 : 0, transactionId, data: authRequired ? { authState: 0 } : data
      })), false));
    }

    terminate() {}
  }

  const machine = { origin: 'wss://192.168.1.12:28900' };
  const status = await readXTool(machine, { Socket: MockSocket });
  assert.equal(status.status, 'ready');
  assert.equal(status.serial, 'M2-123456');
  assert.equal(status.fingerprint, 'AA:BB');
  const identity = await readXTool(machine, { identityOnly: true, Socket: MockSocket });
  assert.deepEqual(identity, { serial: 'M2-123456', fingerprint: 'AA:BB' });
  const rejected = await readXTool({ ...machine, fingerprint: 'CC:DD' }, { Socket: MockSocket });
  assert.equal(rejected.issue, 'xtool-identity');
  authRequired = true;
  assert.deepEqual(await readXTool(machine, { identityOnly: true, Socket: MockSocket }), { candidate: true });
  assert.equal((await readXTool(machine, { Socket: MockSocket })).issue, 'xtool-authorization');
  assert.deepEqual(requests, [
    ['GET', '/v1/user/parity'],
    ['GET', '/v1/platform/device/machine-info'],
    ['POST', '/v1/platform/device/state/sync'],
    ['GET', '/v1/user/parity'],
    ['GET', '/v1/platform/device/machine-info'],
    ['GET', '/v1/user/parity'],
    ['GET', '/v1/user/parity']
  ]);
});

test('M2 attend la confirmation et réutilise le jeton lors de la connexion suivante', async () => {
  let confirmationRequested = false;
  let pair = true;
  class MockSocket extends EventEmitter {
    constructor() {
      super();
      queueMicrotask(() => {
        this.emit('upgrade', { socket: { getPeerCertificate: () => ({ fingerprint256: 'AA:BB' }) } });
        this.emit('open');
      });
    }
    send(frame) {
      const request = JSON.parse(frame.subarray(10));
      let code = 0;
      let data;
      switch (request.url) {
        case '/v1/user/parity':
          assert.equal(request.data.token, pair ? '' : 'persistent-token');
          if (pair) {
            code = 406;
            data = { authState: 'WAITING_BUTTON_CONFIRM' };
          } else data = { sessionToken: 'temporary-token' };
          break;
        case '/v1/user/auth-status':
          confirmationRequested = true;
          data = { token: 'persistent-token', sessionToken: 'temporary-token' };
          break;
        case '/v1/platform/device/machine-info':
          assert.equal(request.sessionToken, 'temporary-token');
          if (pair) assert.ok(confirmationRequested);
          data = { sn: 'M2-123456' };
          break;
        case '/v1/platform/device/state/sync':
          assert.equal(request.sessionToken, 'temporary-token');
          this.emit('message', Buffer.from(JSON.stringify({
            type: 'request', transactionId: 99999,
            data: { '/v1/platform/device/state': { curMode: { mode: 'Idle' } } }
          })), false);
          data = {};
          break;
        default:
          assert.fail(request.url);
      }
      queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({
        type: 'response', transactionId: request.transactionId, code, data
      })), false));
    }
    terminate() {}
  }
  const machine = { origin: 'wss://192.168.1.12:28900' };
  const paired = await readXTool(machine, { Socket: MockSocket, pairing: true });
  assert.equal(paired.status, 'ready');
  assert.equal(paired.pairingToken, 'persistent-token');
  pair = false;
  const status = await readXTool({ ...machine, pairingToken: paired.pairingToken, fingerprint: paired.fingerprint },
    { Socket: MockSocket });
  assert.equal(status.status, 'ready');
  assert.equal(status.pairingToken, undefined);
});
