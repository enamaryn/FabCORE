import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { subscribeXToolVideo } from './xtool-media.mjs';

function frame(id, bytes) {
  const body = Buffer.concat([Buffer.from([id]), bytes]);
  const header = Buffer.alloc(10);
  header.writeUInt16BE(0xbabe);
  header.writeUIntBE(body.length, 2, 3);
  header[5] = 0x80 | 34;
  let crc = 0;
  for (const byte of header.subarray(0, 8)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xa001 : 0);
  }
  header.writeUInt16BE(crc, 8);
  return Buffer.concat([header, body]);
}

test('les caméras partagent le canal média authentifié et démultiplexent les identifiants réels', async () => {
  let opened = 0;
  let socket;
  const calls = [];
  class MediaSocket extends EventEmitter {
    constructor(url) {
      super();
      socket = this;
      opened++;
      assert.equal(url.port, '28900');
      assert.equal(url.searchParams.get('id'), 'same-client');
      assert.equal(url.searchParams.get('function'), 'media_stream');
      queueMicrotask(() => {
        this.emit('upgrade', { socket: { getPeerCertificate: () => ({ fingerprint256: 'AA' }) } });
        this.emit('open');
      });
    }
    terminate() {}
  }
  const session = { url: new URL('wss://192.168.1.134:28900/websocket?id=same-client'),
    fingerprint: 'AA', Socket: MediaSocket,
    async request(method, url, body, params) {
      assert.deepEqual(body, {});
      calls.push(params);
      return {};
    }
  };
  const side = [];
  const far = [];
  const stopSide = await subscribeXToolVideo(session, { id: 2, name: 'side' },
    new AbortController().signal, bytes => side.push(bytes), assert.fail);
  socket.emit('message', frame(0, Buffer.from([0, 0, 1, 0x67])), true);
  assert.equal(side.length, 1);
  const stopFar = await subscribeXToolVideo(session, { id: 0, name: 'far' },
    new AbortController().signal, bytes => far.push(bytes), assert.fail);
  const packet = frame(2, Buffer.from([0, 0, 1, 0x65]));
  socket.emit('message', packet.subarray(0, 8), true);
  socket.emit('message', packet.subarray(8), true);
  assert.equal(opened, 1);
  assert.equal(side.length, 2);
  assert.equal(far.length, 0);
  stopSide();
  socket.emit('message', frame(0, Buffer.from([0, 0, 1, 0x65])), true);
  assert.equal(far.length, 1);
  stopFar();
  assert.deepEqual(calls, [
    { action: 'start', name: 'side' }, { action: 'start', name: 'far' },
    { action: 'stop', name: 'side' }, { action: 'stop', name: 'far' }
  ]);
});
