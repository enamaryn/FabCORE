import { Writable } from 'node:stream';

export function cameraPreview(response) {
  let bytes = Buffer.alloc(0);
  let sent = false;
  const preview = new Writable({
    write(chunk, _, done) {
      if (sent) return done();
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.length > 8 * 1024 * 1024) {
        preview.destroy();
        return done();
      }
      const start = bytes.indexOf(Buffer.from([0xff, 0xd8]));
      const end = start >= 0 ? bytes.indexOf(Buffer.from([0xff, 0xd9]), start + 2) : -1;
      if (end >= 0) {
        sent = true;
        response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
        response.end(bytes.subarray(start, end + 2));
        preview.destroy();
      }
      done();
    }
  });
  preview.writeHead = () => {};
  const timeout = setTimeout(() => preview.destroy(), 15_000);
  response.once('close', () => preview.destroy());
  preview.once('close', () => {
    clearTimeout(timeout);
    if (!sent && !response.writableEnded) {
      if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'camera-unavailable' }));
    }
  });
  return preview;
}
