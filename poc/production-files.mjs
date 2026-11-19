import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm, stat, open, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createReadStream, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { inflateRawSync, crc32 } from 'node:zlib';
import { filePath } from './connector-http.mjs';

export const productionPath = path => filePath(path) || (
  typeof path === 'string' && filePath(path.replace(/\.3mf$/i, '.gcode')) && /\.3mf$/i.test(path) ? path : null);
const limit = 512 * 1024 * 1024;

// Read only the selected ZIP entry, never extract paths to disk. Reject ambiguous plates.
export async function projectGcode(filename) {
  const file = await open(filename, 'r');
  try {
    const size = (await file.stat()).size;
    const tail = Buffer.alloc(Math.min(size, 65557));
    await file.read(tail, 0, tail.length, size - tail.length);
    let end = tail.length - 22;
    for (; end >= 0; end--) if (tail.readUInt32LE(end) === 0x06054b50 && end + 22 + tail.readUInt16LE(end + 20) === tail.length) break;
    if (end < 0 || tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6)) throw new Error('project-format');
    const count = tail.readUInt16LE(end + 10);
    const centralSize = tail.readUInt32LE(end + 12), centralOffset = tail.readUInt32LE(end + 16);
    if (count > 4096 || centralSize > 2 * 1024 * 1024 || centralOffset + centralSize > size - tail.length + end) throw new Error('project-format');
    const central = Buffer.alloc(centralSize);
    await file.read(central, 0, central.length, centralOffset);
    const entries = [];
    for (let at = 0, i = 0; i < count; i++) {
      if (at + 46 > central.length || central.readUInt32LE(at) !== 0x02014b50) throw new Error('project-format');
      const nameLength = central.readUInt16LE(at + 28);
      const name = central.subarray(at + 46, at + 46 + nameLength).toString('utf8');
      if (/^Metadata\/plate_\d+\.gcode$/.test(name)) entries.push({ name, flags: central.readUInt16LE(at + 8),
        method: central.readUInt16LE(at + 10), crc: central.readUInt32LE(at + 16), packed: central.readUInt32LE(at + 20), size: central.readUInt32LE(at + 24), offset: central.readUInt32LE(at + 42) });
      at += 46 + nameLength + central.readUInt16LE(at + 30) + central.readUInt16LE(at + 32);
      if (at > central.length) throw new Error('project-format');
    }
    if (entries.length !== 1) throw new Error(entries.length ? 'project-multiple-plates' : 'project-no-gcode');
    const entry = entries[0];
    if (entry.flags & 1 || ![0, 8].includes(entry.method) || !entry.size || entry.size > 128 * 1024 * 1024 || entry.packed > limit) throw new Error('project-format');
    const header = Buffer.alloc(30);
    await file.read(header, 0, 30, entry.offset);
    if (header.readUInt32LE() !== 0x04034b50) throw new Error('project-format');
    const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    if (start + entry.packed > centralOffset) throw new Error('project-format');
    const packed = Buffer.alloc(entry.packed);
    await file.read(packed, 0, packed.length, start);
    const bytes = entry.method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: entry.size });
    if (bytes.length !== entry.size || crc32(bytes) !== entry.crc) throw new Error('project-format');
    return { name: entry.name, bytes };
  } finally { await file.close(); }
}

// Some protocols cannot list storage. Retain only successfully transferred files,
// scoped to machine identity; do not call this a complete view of printer storage.
export function retainedFiles(directory, native, { projects = false } = {}) {
  const folder = machine => join(directory, createHash('sha256').update(JSON.stringify([machine.id, machine.origin, machine.serial])).digest('hex'));
  const valid = path => (projects ? productionPath(path) : filePath(path)) && !path.includes('/');
  const local = (machine, path) => {
    if (!valid(path)) throw new Error('invalid-file');
    return join(folder(machine), path);
  };
  async function project(machine, path, signal) {
    if (!native.download && valid(path)) {
      try { return await projectGcode(local(machine, path)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!native.download) throw new Error('project-format');
    const response = await native.download(machine, path, signal);
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('project-format'); }
    const temp = await mkdtemp(join(tmpdir(), 'fabcore-project-'));
    let received = 0;
    try {
      const filename = join(temp, 'project');
      await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, done) {
        received += chunk.length;
        done(received > limit ? new Error('file-too-large') : null, chunk);
      } }), createWriteStream(filename, { flags: 'wx', mode: 0o600 }));
      return await projectGcode(filename);
    } finally { await rm(temp, { recursive: true, force: true }); }
  }
  return {
    async list(machine) {
      let names = [];
      try { names = await readdir(folder(machine)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const entries = await Promise.all(names.filter(valid).slice(0, 300).map(async path => {
        const info = await stat(local(machine, path));
        return { path, size: info.size, modified: info.mtimeMs };
      }));
      if (!native.list) return entries;
      const remote = await native.list(machine);
      return [...new Map([...entries, ...remote].map(entry => [entry.path, entry])).values()];
    },
    async download(machine, path, signal) {
      if (projects && /\.3mf$/i.test(path)) return new Response((await project(machine, path, signal)).bytes);
      if (!native.download && valid(path)) {
        try {
          const target = local(machine, path);
          const info = await stat(target);
          return new Response(Readable.toWeb(createReadStream(target, { signal })), { headers: { 'Content-Length': String(info.size) } });
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return native.download ? native.download(machine, path, signal) : new Response(null, { status: 404 });
    },
    async upload(machine, name, source, size) {
      const target = local(machine, name);
      await mkdir(folder(machine), { recursive: true, mode: 0o700 });
      const entries = await this.list(machine);
      if (entries.some(entry => entry.path === name)) throw new Error('file-exists');
      if (entries.length >= 300 || entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0) + size > 2 * 1024 ** 3) throw new Error('file-quota');
      const temp = target + '.' + randomUUID() + '.part';
      let received = 0;
      try {
        await pipeline(source, new Transform({ transform(chunk, _encoding, done) {
          received += chunk.length;
          done(received > size || received > limit ? new Error('file-too-large') : null, chunk);
        } }), createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
        if (received !== size) throw new Error('file-truncated');
        if (/\.3mf$/i.test(name)) await projectGcode(temp);
        const result = await native.upload(machine, name, createReadStream(temp), size);
        if (!result) return null;
        await rename(temp, target);
        return name;
      } finally { await rm(temp, { force: true }); }
    },
    async start(machine, path) {
      if (projects && /\.3mf$/i.test(path)) {
        const entry = await project(machine, path);
        return native.start(machine, path, entry.name);
      }
      if (!native.list) await stat(local(machine, path));
      return native.start(machine, path);
    }
  };
}
