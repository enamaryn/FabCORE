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
