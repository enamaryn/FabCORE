import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { checkServerIdentity, connect } from 'node:tls';
import { privateIPv4 } from './moonraker.mjs';

const ca = readFileSync(new URL('./certs/bambu-p2s.pem', import.meta.url));
const ffmpegArgs = [
  '-nostdin', '-loglevel', 'error', '-f', 'concat', '-safe', '0',
  '-protocol_whitelist', 'pipe,tcp,rtp', '-i', 'pipe:0',
  '-an', '-filter_threads', '1', '-vf', 'fps=4,scale=960:-2',
  '-threads', '1', '-c:v', 'mjpeg', '-f', 'mpjpeg', 'pipe:1'
];

export async function streamBambuCamera(machine, response, signal) {
  const host = new URL(machine.origin).hostname;
  if (!privateIPv4(host) || !/^[A-Za-z0-9]{8,32}$/.test(machine.serial) ||
      !/^[A-Za-z0-9]{8}$/.test(machine.accessCode) || signal.aborted) return false;
  let child;
  let local;
  const remote = connect({ host, port: 322, ca, maxVersion: 'TLSv1.2',
    checkServerIdentity: (_, certificate) => checkServerIdentity(machine.serial, certificate) });
  const relay = createServer((socket) => {
    if (local) return socket.destroy();
    local = socket;
    socket.on('error', stop);
    socket.on('close', stop);
    socket.pipe(remote).pipe(socket);
  });
  function stop() {
    if (relay.listening) relay.close();
    local?.destroy();
    if (!remote.destroyed) remote.destroy();
    if (child?.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  const startup = setTimeout(stop, 12000);
  signal.addEventListener('abort', stop, { once: true });
  try {
    await new Promise((resolve, reject) => {
      remote.once('secureConnect', resolve);
      remote.on('error', reject);
      remote.once('close', () => { reject(new Error('Camera TLS closed')); stop(); });
    });
    if (signal.aborted) return false;
    remote.setTimeout(15000, stop);
    await new Promise((resolve, reject) => {
      relay.once('error', reject);
      relay.listen(0, '127.0.0.1', resolve);
    });
    if (signal.aborted || remote.destroyed) return false;
    child = spawn(process.env.FABCORE_FFMPEG || 'ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'ignore'] });
    child.on('error', () => child.stdout.destroy());
    child.stdin.on('error', stop);
    const input = 'rtsp://bblp:' + machine.accessCode + '@127.0.0.1:' + relay.address().port + '/streaming/live/1';
    // Send the credentials on stdin so they do not appear in the process list.
    child.stdin.end("ffconcat version 1.0\nfile '" + input + "'\noption rtsp_transport tcp\noption timeout 8000000\n");
    const frames = child.stdout[Symbol.asyncIterator]();
    const first = await frames.next();
    if (first.done || signal.aborted) return false;
    clearTimeout(startup);
    response.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg',
      'X-Accel-Buffering': 'no', 'Cross-Origin-Resource-Policy': 'same-origin' });
    async function* parts() {
      yield first.value;
      yield* { [Symbol.asyncIterator]: () => frames };
    }
    await pipeline(Readable.from(parts()), response, { signal });
    return true;
  } finally {
    clearTimeout(startup);
    signal.removeEventListener('abort', stop);
    stop();
  }
}
