import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { snapshotXToolCamera } from './xtool-camera.mjs';

function crc16(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xa001 : 0);
  }
  return crc;
}

test('la caméra M2 partage la session et vérifie le transfert de son JPEG', async () => {
  const image = Buffer.from([0xff, 0xd8, 1, 2, 3, 4, 0xff, 0xd9, 0, 0, 0, 0]);
  let controller = new AbortController();
  let expectedView = "side";
  let downloads = 0;
  let finishes = 0;
  let badDigest = false;
  class FileSocket extends EventEmitter {
    constructor(url) {
      super();
      assert.equal(url.searchParams.get('id'), 'shared-session');
      assert.equal(url.searchParams.get('function'), 'file_stream');
      queueMicrotask(() => {
        this.emit('upgrade', { socket: { getPeerCertificate: () => ({ fingerprint256: 'AA' }) } });
        this.emit('open');
      });
    }
    send(request) {
      assert.equal(request[5], 0x80 | 33);
      assert.equal(request.readUInt16BE(8), crc16(request.subarray(0, 8)));
      const offset = request.readUIntBE(12, 5);
      const length = request.readUIntBE(17, 3);
      const body = Buffer.alloc(7 + length);
      body[0] = 129;
      body[1] = 1;
      body.writeUIntBE(offset, 2, 5);
      image.copy(body, 7, offset, offset + length);
      const header = Buffer.alloc(10);
      header.writeUInt16BE(0xbabe);
      header.writeUIntBE(body.length, 2, 3);
      header[5] = 33;
      header.writeUInt16BE(crc16(body), 6);
      header.writeUInt16BE(crc16(header.subarray(0, 8)), 8);
      const frame = Buffer.concat([header, body]);
      queueMicrotask(() => {
        this.emit('message', frame.subarray(0, 6), true);
        this.emit('message', frame.subarray(6), true);
      });
    }
    terminate() {}
  }
  const session = {
    url: new URL('wss://192.168.1.134:28900/websocket?id=shared-session&function=instruction'),
    fingerprint: 'AA', Socket: FileSocket,
    async request(method, path, data, params) {
      if (path.endsWith('/snap')) {
        assert.deepEqual(params, { name: expectedView });
        return { filename: '/camera/test.jpg' };
      }
      if (path.endsWith('/download')) {
        downloads++;
        assert.equal(data.filetype, 5);
        return { filesize: image.length, packetsize: 4,
          digestdata: badDigest ? '0'.repeat(32) : createHash('md5').update(image).digest('hex') };
      }
      assert.ok(path.endsWith('/finish'));
      finishes++;
      throw new Error('failed to finish file transfer');
    }
  };
  assert.deepEqual(await snapshotXToolCamera(() => session, controller.signal), image.subarray(0, image.length - 4));
  assert.equal(downloads, 1);
  assert.equal(finishes, 1);
  for (const view of ['far', 'near']) {
    expectedView = view;
    await snapshotXToolCamera(() => session, controller.signal, view);
  }
  assert.equal(downloads, 3);
  assert.equal(finishes, 3);
  expectedView = 'side';
  badDigest = true;
  await assert.rejects(snapshotXToolCamera(() => session, controller.signal), /invalid-image/);
  assert.equal(finishes, 3);
});
