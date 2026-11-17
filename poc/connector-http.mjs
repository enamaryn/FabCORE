import { isIPv4 } from 'node:net';

export function privateIPv4(host) {
  if (!isIPv4(host)) return false;
  const [a, b] = host.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function moonrakerOrigin(input) {
  let url;
  try { url = new URL(input); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || url.port === '0' || !privateIPv4(url.hostname)) return null;
  return url.origin;
}

export async function readResponse(response) {
  if (!response.body) throw new SyntaxError('Réponse JSON vide.');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 64 * 1024) {
        await reader.cancel();
        throw new SyntaxError('Réponse JSON trop volumineuse.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Fichiers d’impression : chemins relatifs simples, sans remontée de dossier.
export const gcodeExtension = /\.(gcode|gco|g)$/i;
export function filePath(path) {
  if (typeof path !== 'string' || path.length < 1 || path.length > 255 || !/^[\x20-\x7E]+$/.test(path)) return null;
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.trim() !== part)) return null;
  return gcodeExtension.test(path) ? path : null;
}
export const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

// Corps multipart/form-data diffusé sans mettre le fichier en mémoire.
export function multipart(field, name, source, size, extra = {}) {
  const boundary = '----FabCore' + crypto.randomUUID().replaceAll('-', '');
  const fields = Object.entries(extra).map(([key, value]) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`).join('');
  const head = Buffer.from(`${fields}--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${name.replaceAll('"', '')}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  async function* parts() {
    yield head;
    let received = 0;
    for await (const chunk of source) {
      received += chunk.length;
      if (received > size) throw new Error('upload larger than announced');
      yield chunk;
    }
    if (received !== size) throw new Error('upload truncated');
    yield tail;
  }
  return {
    body: ReadableStream.from(parts()),
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': String(head.length + size + tail.length) }
  };
}
