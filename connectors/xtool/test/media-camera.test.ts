import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createXToolCamera } from '../src/camera.ts';
import { subscribeXToolVideo } from '../src/media.ts';
import type { XToolSession } from '../src/types.ts';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function sessionFor(Socket: XToolSession['Socket'], request: XToolSession['request']): XToolSession {
  return { url: new URL('wss://192.168.1.12:28900/websocket?id=shared-session'), fingerprint: 'AA', Socket, request };
}

test('M2 média: certificat modifié ferme le canal sans démarrer de vidéo', async () => {
  let closed = 0;
  let disconnected = 0;
  const actions: unknown[] = [];
  class Socket extends EventEmitter {
    constructor(url: URL) {
      super();
      assert.equal(url.searchParams.get('id'), 'shared-session');
      assert.equal(url.searchParams.get('function'), 'media_stream');
      queueMicrotask(() => {
        this.emit('upgrade', { socket: { getPeerCertificate: () => ({ fingerprint256: 'CHANGED' }) } });
        this.emit('open');
      });
    }
    send() { assert.fail('pas de transfert sur ce canal'); }
    terminate() { closed++; }
  }
  const session = sessionFor(Socket, async <T>(_method: string, _path: string, _data?: Record<string, unknown>, params?: Record<string, unknown>) => {
    actions.push(params?.action);
    return {} as T;
  });
  await assert.rejects(subscribeXToolVideo(session, { id: 2, name: 'side' }, new AbortController().signal,
    () => assert.fail(), () => { disconnected++; }), /xtool-media/);
  assert.equal(closed, 1);
  assert.equal(disconnected, 1);
  assert.deepEqual(actions, ['stop']);
});

test('M2 média: trame invalide ferme le flux et arrête la caméra sur la session existante', async () => {
  const sockets: Socket[] = [];
  let closed = 0;
  let disconnected = 0;
  const actions: unknown[] = [];
  class Socket extends EventEmitter {
    constructor() {
      super();
      sockets.push(this);
      queueMicrotask(() => {
        this.emit('upgrade', { socket: { getPeerCertificate: () => ({ fingerprint256: 'AA' }) } });
        this.emit('open');
      });
    }
    send() { assert.fail(); }
    terminate() { closed++; }
  }
  const session = sessionFor(Socket, async <T>(_method: string, _path: string, _data?: Record<string, unknown>, params?: Record<string, unknown>) => {
    actions.push(params?.action);
    return {} as T;
  });
  const stop = await subscribeXToolVideo(session, { id: 7, name: 'near' }, new AbortController().signal,
    () => assert.fail(), () => { disconnected++; });
  sockets[0]!.emit('message', Buffer.alloc(10), true);
  await flush();
  await stop();
  assert.equal(closed, 1);
  assert.equal(disconnected, 1);
  assert.deepEqual(actions, ['start', 'stop']);
});

test('M2 capture: TLS différent rejette le téléchargement et ne confirme pas le transfert', async () => {
  let opened = 0;
  let closed = 0;
  const requests: string[] = [];
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  class Socket extends EventEmitter {
    constructor(url: URL) {
      super();
      opened++;
      assert.equal(url.searchParams.get('id'), 'shared-session');
      assert.equal(url.searchParams.get('function'), 'file_stream');
      queueMicrotask(() => {
        this.emit('upgrade', { socket: { getPeerCertificate: () => ({ fingerprint256: 'CHANGED' }) } });
        this.emit('open');
      });
    }
    send() { assert.fail('aucune fenêtre après échec TLS'); }
    terminate() { closed++; }
  }
  const session = sessionFor(Socket, async <T>(_method: string, path: string) => {
    requests.push(path);
    return (path.endsWith('/snap') ? { filename: '/camera/snapshot.jpg' } : {
      filesize: image.length, digestdata: createHash('md5').update(image).digest('hex')
    }) as T;
  });
  const camera = createXToolCamera({ async *observeImages(source) { yield* source; } });
  await assert.rejects(camera.snapshotXToolCamera(() => session, new AbortController().signal, 'far'), /camera-closed/);
  assert.equal(opened, 1);
  assert.equal(closed, 1);
  assert.deepEqual(requests, ['/v1/platform/camera/snap', '/v1/filetransfer/download']);
});
