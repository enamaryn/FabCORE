import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { subscribeXToolVideo } from './xtool-media.mjs';
import { observeImages } from './diagnostics.mjs';
import { setTimeout as delay } from 'node:timers/promises';

function crc16(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xa001 : 0);
  }
  return crc;
}

async function download(session, filename, signal) {
  const channel = 1;
  const info = await session.request('PUT', '/v1/filetransfer/download', {
    filetype: 5, filename, digesttype: 1, channel, packetsize: 1024 * 1024
  });
  const size = info?.filesize;
  if (!Number.isSafeInteger(size) || size <= 0 || size > 8 * 1024 * 1024 ||
      typeof info.digestdata !== 'string' || !/^[a-f0-9]{32}$/i.test(info.digestdata)) throw new Error('invalid-image');
  const url = new URL(session.url);
  url.searchParams.set('function', 'file_stream');
  const image = await new Promise((resolve, reject) => {
    const ws = new session.Socket(url, { rejectUnauthorized: false, followRedirects: false,
      origin: 'atomm://renderer', handshakeTimeout: 4000, maxPayload: 2 * 1024 * 1024 });
    const bytes = Buffer.alloc(size);
    let received = 0;
    let windowEnd = 0;
    let buffer = Buffer.alloc(0);
    let done = false;
    const stop = () => finish(new Error('camera-closed'));
    const timer = setTimeout(stop, 10_000);
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      ws.terminate();
      if (error) reject(error);
      else resolve(bytes);
    }
    function requestWindow() {
      const length = Math.min(1024 * 1024, size - received,
        Number.isSafeInteger(info.packetsize) && info.packetsize > 0 ? info.packetsize : 1024 * 1024);
      windowEnd = received + length;
      const body = Buffer.alloc(10);
      body[0] = 1;
      body[1] = channel;
      body.writeUIntBE(received, 2, 5);
      body.writeUIntBE(length, 7, 3);
      const header = Buffer.alloc(10);
      header.writeUInt16BE(0xbabe);
      header.writeUIntBE(body.length, 2, 3);
      header[5] = 0x80 | 33;
      header.writeUInt16BE(crc16(header.subarray(0, 8)), 8);
      ws.send(Buffer.concat([header, body]));
    }
    ws.on('error', stop);
    ws.on('close', stop);
    ws.on('upgrade', response => {
      if (response.socket.getPeerCertificate()?.fingerprint256 !== session.fingerprint) stop();
    });
    ws.on('open', () => { if (!done) requestWindow(); });
    ws.on('message', (chunk, binary) => {
      if (done || !binary) return;
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 2 * 1024 * 1024) return stop();
      while (buffer.length >= 10 && !done) {
        const length = buffer.readUIntBE(2, 3);
        if (buffer.readUInt16BE() !== 0xbabe || length > 2 * 1024 * 1024 - 10 ||
            buffer.readUInt16BE(8) !== crc16(buffer.subarray(0, 8))) return stop();
        if (buffer.length < length + 10) return;
        const frame = buffer.subarray(0, length + 10);
        buffer = buffer.subarray(length + 10);
        const body = frame.subarray(10);
        if (!(frame[5] & 0x80) && frame.readUInt16BE(6) !== crc16(body)) return stop();
        if ((frame[5] & 0x7f) !== 33 || body[0] !== 129) continue;
        if (body.length < 8 || body[1] !== channel) return stop();
        const offset = body.readUIntBE(2, 5);
        const data = body.subarray(7);
        if (offset !== received || received + data.length > windowEnd) return stop();
        data.copy(bytes, received);
        received += data.length;
        if (received === size) finish();
        else if (received === windowEnd) requestWindow();
      }
    });
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
  });
  const end = image.lastIndexOf(Buffer.from([0xff, 0xd9]));
  if (createHash('md5').update(image).digest('hex') !== info.digestdata.toLowerCase() ||
      image.readUInt16BE(0) !== 0xffd8 || end < 2 ||
      image.subarray(end + 2).some(byte => byte !== 0)) throw new Error('invalid-image');
  // ha-xtool treats finish as best effort after the complete file passes MD5.
  await session.request('PUT', '/v1/filetransfer/finish', { code: 0, message: 'file transfer finish', channel }).catch(() => {});
  return image.subarray(0, end + 2);
}

const transfers = new WeakMap();

async function capture(session, view, signal) {
  const previous = transfers.get(session) ?? Promise.resolve();
  const transfer = previous.catch(() => {}).then(async () => {
    signal.throwIfAborted();
    const snap = await session.request('POST', '/v1/platform/camera/snap', {}, { name: view });
    if (typeof snap?.filename !== 'string' || !snap.filename || snap.filename.length > 512) throw new Error('invalid-stream');
    return download(session, snap.filename, signal);
  });
  transfers.set(session, transfer);
  try { return await transfer; }
  finally { if (transfers.get(session) === transfer) transfers.delete(session); }
}

async function readySession(getSession, signal) {
  for (let attempt = 0; !getSession() && attempt < 24; attempt++) {
    await delay(500, undefined, { signal });
  }
  const session = getSession();
  if (!session) throw new Error('xtool-connection');
  return session;
}

export async function snapshotXToolCamera(getSession, signal, view = 'side') {
  if (!['side', 'far', 'near'].includes(view)) throw new Error('invalid-camera');
  return capture(await readySession(getSession, signal), view, signal);
}

export async function streamXToolCamera(getSession, output, signal, onFrame, view = 'side') {
  if (!['side', 'far', 'near'].includes(view)) return 'invalid-stream';
  let session;
  let unsubscribe;
  let child;
  let startup;
  let idle;

  const stop = () => {
    void unsubscribe?.();
    if (child?.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  };
  signal.addEventListener('abort', stop, { once: true });
  try {
    session = await readySession(getSession, signal);
    signal.throwIfAborted();
    const cameras = await session.request('GET', '/v1/platform/camera/list');
    const camera = Array.isArray(cameras) ? cameras.find(item => item.name === view) : null;
    if (!camera || !Number.isSafeInteger(camera.id) || camera.id < 0) return 'invalid-stream';
    const frameRate = Number.isFinite(camera.fps) && camera.fps >= 1 && camera.fps <= 60 ? camera.fps : 25;
    child = spawn(process.env.FABCORE_FFMPEG || 'ffmpeg', [
      '-nostdin', '-loglevel', 'error', '-probesize', '32', '-analyzeduration', '0',
      '-f', 'h264', '-framerate', String(frameRate), '-threads', '1', '-fflags', '+genpts',
      '-i', 'pipe:0', '-an', '-filter_threads', '1', '-vf', `setpts=N/(${frameRate}*TB),fps=10,scale=960:-2`,
      '-threads', '1', '-c:v', 'mjpeg', '-f', 'mpjpeg', '-flush_packets', '1', 'pipe:1'
    ], { stdio: ['pipe', 'pipe', 'ignore'] });
    child.on('error', () => child.stdout.destroy());
    child.stdin.on('error', stop);
    unsubscribe = await subscribeXToolVideo(session, camera, signal, data => {
      if (signal.aborted || child.stdin.destroyed) return;
      clearTimeout(idle);
      idle = setTimeout(stop, 15_000);
      if (child.stdin.writableLength + data.length > 4 * 1024 * 1024) return stop();
      child.stdin.write(data);
    }, stop);
    startup = setTimeout(stop, 15_000);
    const chunks = child.stdout[Symbol.asyncIterator]();
    const first = await chunks.next();
    if (first.done || signal.aborted) return 'invalid-stream';
    clearTimeout(startup);
    output.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg',
      'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    async function* frames() {
      yield first.value;
      yield* { [Symbol.asyncIterator]: () => chunks };
    }
    await pipeline(Readable.from(observeImages(frames(), onFrame)), output, { signal });
  } catch {
    if (!signal.aborted) return 'invalid-stream';
  } finally {
    clearTimeout(startup);
    clearTimeout(idle);
    signal.removeEventListener('abort', stop);
    stop();
    await unsubscribe?.();
  }
}
