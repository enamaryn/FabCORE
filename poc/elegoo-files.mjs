import { createCC2Files } from '../connectors/elegoo/src/files.ts';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, open } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { filePath, privateIPv4, readResponse } from './connector-http.mjs';

export async function stagedUpload(source, size, send) {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-transfer-'));
  const path = join(directory, 'payload');
  const hash = createHash('md5');
  let received = 0;
  try {
    await pipeline(source, new Transform({ transform(chunk, _encoding, done) {
      received += chunk.length;
      if (received > size || received > 512 * 1024 * 1024) return done(new Error('upload-size'));
      hash.update(chunk); done(null, chunk);
    } }), createWriteStream(path, { mode: 0o600, flags: 'wx' }));
    if (received !== size) throw new Error('upload-truncated');
    return await send(path, hash.digest('hex'));
  } finally { await rm(directory, { recursive: true, force: true }); }
}

// elegoo-link: CC2 HTTP PUT /upload; CC1 multipart POST /uploadFile/upload.
export function createElegooFiles(rpc, { cc1 = false, fetcher = fetch, queryFiles } = {}) {
  const upload = async (machine, name, source, size) => {
      return stagedUpload(source, size, async (path, md5) => {
        const file = await open(path, 'r');
        const uuid = randomUUID();
        try {
          for (let offset = 0; offset < size; offset += 1024 * 1024) {
            const bytes = Buffer.alloc(Math.min(1024 * 1024, size - offset));
            await file.read(bytes, 0, bytes.length, offset);
            const headers = cc1 ? {} : { 'Content-Type': 'application/octet-stream', 'X-Token': machine.accessCode,
              'X-File-Name': name, 'X-File-MD5': md5, 'Content-Range': `bytes ${offset}-${offset + bytes.length - 1}/${size}` };
            let body = bytes;
            if (cc1) {
              body = new FormData();
              for (const [key, value] of Object.entries({ Check: '1', 'S-File-MD5': md5, Offset: String(offset), Uuid: uuid, TotalSize: String(size) })) body.set(key, value);
              body.set('File', new Blob([bytes]), name);
            }
            const url = `http://${new URL(machine.origin).hostname}${cc1 ? ':3030/uploadFile/upload' : '/upload'}`;
            const response = await fetcher(url, { method: cc1 ? 'POST' : 'PUT', headers, body, redirect: 'error', signal: AbortSignal.timeout(30000) });
            if (!response.ok) { await response.body?.cancel(); return null; }
            const data = await readResponse(response);
            if (cc1 ? data?.code !== '000000' : data?.error_code !== 0) return null;
          }
          return name;
        } finally { await file.close(); }
      });
    };
  if (!cc1) return createCC2Files(rpc, { fetcher, queryFiles, filePath, privateIPv4, upload });
  return {
    upload,
    async start(machine, path) {
      return rpc(machine, 128, { Filename: path, StartLayer: 0, Calibration_switch: 1, PrintPlatformType: 0, Tlp_Switch: 0, slot_map: [] });
    }
  };
}
