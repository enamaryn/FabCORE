import { get } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { observeImages } from './diagnostics.mjs';
import { privateIPv4 } from './connector-http.mjs';

const ports = new Map([['elegoo-cc1', 3031], ['elegoo', 8080]]);

export function cameraURL(machine) {
  const port = ports.get(machine.kind);
  const host = new URL(machine.origin).hostname;
  return port && privateIPv4(host) ? new URL(`http://${host}:${port}/video`) : null;
}

function openCamera(url, signal) {
  return new Promise((resolve, reject) => {
    const request = get(url, { signal }, (response) => {
      clearTimeout(connectTimeout);
      resolve(response);
    });
    const connectTimeout = setTimeout(() => request.destroy(new Error('Camera connection timeout')), 4000);
    request.setTimeout(12000, () => request.destroy(new Error('Camera idle timeout')));
    request.on('error', (error) => {
      clearTimeout(connectTimeout);
      reject(error);
    });
  });
}

export async function streamCamera(url, res, signal, open = openCamera, onFrame = () => {}) {
  const upstream = await open(url, signal);
  const type = upstream.headers['content-type'] ?? '';
  if (upstream.statusCode !== 200 || !/^multipart\/x-mixed-replace\s*;\s*boundary\s*=\s*(?:"[-A-Za-z0-9_.]{1,70}"|[-A-Za-z0-9_.]{1,70})\s*$/i.test(type)) {
    upstream.destroy();
    return false;
  }
  res.writeHead(200, {
    'Content-Type': type,
    'X-Accel-Buffering': 'no',
    'Cross-Origin-Resource-Policy': 'same-origin'
  });
  await pipeline(upstream, (stream) => observeImages(stream, onFrame), res, { signal });
  return true;
}
