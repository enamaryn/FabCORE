import { createHash } from 'node:crypto';
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
  if (createHash('md5').update(image).digest('hex') !== info.digestdata.toLowerCase() ||
      image.readUInt16BE(0) !== 0xffd8 || image.readUInt16BE(image.length - 2) !== 0xffd9) throw new Error('invalid-image');
  await session.request('PUT', '/v1/filetransfer/finish', { code: 0, message: 'file transfer finish', channel });
  return image;
}

export async function streamXToolCamera(getSession, output, signal, onFrame) {
  try {
    // A camera viewer shares the existing authenticated instruction session.
    for (let attempt = 0; !getSession() && attempt < 24; attempt++) {
      await delay(500, undefined, { signal });
    }
    let started = false;
    while (!signal.aborted) {
      const session = getSession();
      if (!session) return 'xtool-connection';
      const snap = await session.request('POST', '/v1/platform/camera/snap', {}, { name: 'far' });
      if (typeof snap?.filename !== 'string' || !snap.filename || snap.filename.length > 512) return 'invalid-stream';
      const image = await download(session, snap.filename, signal);
      if (signal.aborted) return;
      if (!started) {
        output.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=xtool',
          'Cache-Control': 'no-store' });
        started = true;
      }
      output.write(Buffer.concat([Buffer.from('--xtool\r\nContent-Type: image/jpeg\r\nContent-Length: ' +
        image.length + '\r\n\r\n'), image, Buffer.from('\r\n')]));
      onFrame();
      await delay(2000, undefined, { signal });
    }
  } catch {
    if (!signal.aborted) return 'invalid-stream';
  }
}
