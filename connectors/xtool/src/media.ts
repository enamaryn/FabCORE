import type { XToolCamera, XToolSession, XToolUpgrade } from './types.ts';

interface Subscriber { camera: XToolCamera; write(data: Buffer): void; close(): void }
type Media = ReturnType<typeof openMedia>;

const connections = new WeakMap<XToolSession, Media>();
const transitions = new WeakMap<XToolSession, Promise<void>>();

function transition(session: XToolSession, action: () => Promise<void>) {
  const previous = transitions.get(session) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  transitions.set(session, current);
  void current.finally(() => {
    if (transitions.get(session) === current) transitions.delete(session);
  }).catch(() => {});
  return current;
}

function crc16(bytes: Uint8Array) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xa001 : 0);
  }
  return crc;
}

function openMedia(session: XToolSession) {
  const url = new URL(session.url);
  url.searchParams.set('function', 'media_stream');
  const socket = new session.Socket(url, { rejectUnauthorized: false, followRedirects: false,
    origin: 'atomm://renderer', handshakeTimeout: 4000, maxPayload: 4 * 1024 * 1024 });
  const subscribers = new Set<Subscriber>();
  let buffer = Buffer.alloc(0);
  let closed = false;
  let rejectReady: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    rejectReady = reject;
    socket.once('open', () => resolve());
  });
  function close() {
    if (closed) return;
    closed = true;
    connections.delete(session);
    rejectReady(new Error('xtool-media'));
    socket.terminate();
    for (const subscriber of [...subscribers]) subscriber.close();
  }
  socket.on('error', close);
  socket.on('close', close);
  socket.on('upgrade', (response: XToolUpgrade) => {
    if (response.socket.getPeerCertificate()?.fingerprint256 !== session.fingerprint) close();
  });
  socket.on('message', (chunk: Buffer, binary: boolean) => {
    if (!binary || closed) return;
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 4 * 1024 * 1024) return close();
    while (buffer.length >= 10 && !closed) {
      const length = buffer.readUIntBE(2, 3);
      if (buffer.readUInt16BE() !== 0xbabe || length > 4 * 1024 * 1024 - 10 ||
          buffer.readUInt16BE(8) !== crc16(buffer.subarray(0, 8))) return close();
      if (buffer.length < length + 10) return;
      const frame = buffer.subarray(0, length + 10);
      buffer = buffer.subarray(length + 10);
      const payload = frame.subarray(10);
      if (!(frame[5]! & 0x80) && frame.readUInt16BE(6) !== crc16(payload)) return close();
      if ((frame[5]! & 0x7f) !== 34 || payload.length < 2) continue;
      const ids = new Set([...subscribers].map(item => item.camera.id));
      // The initial SPS/PPS for a sole nonzero camera may be tagged with ID 0.
      const initialConfig = payload[0] === 0 && !ids.has(0) && ids.size === 1;
      for (const subscriber of subscribers) {
        if (subscriber.camera.id === payload[0] || initialConfig) subscriber.write(payload.subarray(1));
      }
    }
  });
  return { socket, ready, subscribers, close };
}

export async function subscribeXToolVideo(session: XToolSession, camera: XToolCamera, signal: AbortSignal, write: (data: Buffer) => void, disconnected: () => void) {
  let media: Media | undefined;
  let stopping: Promise<void> | undefined;
  const subscriber = { camera, write, close: () => { void stop(); disconnected(); } };
  const abort = () => { void stop(); };
  function stop(): Promise<void> {
    stopping ??= transition(session, async () => {
      signal.removeEventListener('abort', abort);
      if (!media || !media.subscribers.delete(subscriber)) return;
      if (![...media.subscribers].some(item => item.camera.id === camera.id)) {
        await session.request('POST', '/v1/platform/camera/live', {}, { action: 'stop', name: camera.name }).catch(() => {});
      }
      if (!media.subscribers.size) media.close();
    });
    return stopping;
  }
  try {
    await transition(session, async () => {
      signal.throwIfAborted();
      media = connections.get(session);
      if (!media) {
        media = openMedia(session);
        connections.set(session, media);
      }
      media.subscribers.add(subscriber);
      signal.addEventListener('abort', abort, { once: true });
      await media.ready;
      signal.throwIfAborted();
      if ([...media.subscribers].filter(item => item.camera.id === camera.id).length === 1) {
        await session.request('POST', '/v1/platform/camera/live', {}, { action: 'start', name: camera.name });
      }
      signal.throwIfAborted();
    });
    return stop;
  } catch (error) {
    await stop();
    throw error;
  }
}
