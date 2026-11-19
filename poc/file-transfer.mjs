import { mkdtemp, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Stage the original bytes on disk: FTPS responses may not include their size,
// while destination upload protocols require an exact length. Never start a job.
export async function transferMachineFile(source, destination, path, name, signal, limit = 512 * 1024 * 1024) {
  const response = await (source.files.downloadOriginal ?? source.files.download).call(source.files, source.machine, path, signal);
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(response.status === 404 ? 'missing' : 'files-unavailable');
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!Number.isSafeInteger(Number(declared)) || Number(declared) < 1 || Number(declared) > limit)) {
    await response.body.cancel();
    throw new Error('file-too-large');
  }
  let directory;
  let size = 0;
  try {
    directory = await mkdtemp(join(tmpdir(), 'fabcore-transfer-'));
    const filename = join(directory, 'source');
    await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, done) {
      size += chunk.length;
      done(size > limit ? new Error('file-too-large') : null, chunk);
    } }), createWriteStream(filename, { flags: 'wx', mode: 0o600 }), { signal });
    if (!size || (declared !== null && size !== Number(declared))) throw new Error('file-truncated');
    signal?.throwIfAborted();
    const stream = createReadStream(filename);
    try {
      const stored = await destination.files.upload(destination.machine, name, stream, size);
      if (!stored) throw new Error('upload-rejected');
      return stored;
    } finally { stream.destroy(); }
  } finally {
    if (!directory) await response.body.cancel().catch(() => {});
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
