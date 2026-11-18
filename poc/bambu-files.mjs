import { Client } from 'basic-ftp';
import { readFileSync } from 'node:fs';
import { checkServerIdentity } from 'node:tls';
import { PassThrough, Readable } from 'node:stream';
import { productionPath } from './production-files.mjs';

const ca = readFileSync(new URL('./certs/bambu-p2s.pem', import.meta.url));
export function createBambuFiles(send, makeClient = () => new Client(15000, { allowSeparateTransferHost: false })) {
  async function access(machine) {
    const client = makeClient();
    try {
      await client.access({ host: new URL(machine.origin).hostname, port: 990, user: 'bblp', password: machine.accessCode,
        secure: 'implicit', secureOptions: { ca, rejectUnauthorized: true, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
          checkServerIdentity: (_host, certificate) => checkServerIdentity(machine.serial, certificate) } });
      return client;
    } catch (error) { client.close(); throw error; }
  }
  return {
    async list(machine) {
      const client = await access(machine);
      try {
        const entries = [];
        for (const directory of ['/', '/cache']) {
          let files;
          try { files = await client.list(directory); } catch (error) { if (directory === '/') throw error; else continue; }
          for (const file of files) {
            const path = (directory === '/' ? '' : 'cache/') + file.name;
            if (file.isFile && productionPath(path)) entries.push({ path, size: file.size, modified: file.modifiedAt?.getTime() ?? null });
          }
        }
        return entries;
      } finally { client.close(); }
    },
    async download(machine, path, signal) {
      const client = await access(machine);
      const stream = new PassThrough();
      const abort = () => { client.close(); stream.destroy(new Error('download-aborted')); };
      if (signal?.aborted) { client.close(); return new Response(null, { status: 499 }); }
      signal?.addEventListener('abort', abort, { once: true });
      stream.once('close', () => { if (!stream.readableEnded) client.close(); });
      void client.downloadTo(stream, '/' + path).catch(error => stream.destroy(error)).finally(() => {
        signal?.removeEventListener('abort', abort); client.close();
      });
      return new Response(Readable.toWeb(stream));
    },
    async upload(machine, name, source) {
      const client = await access(machine);
      try { await client.uploadFrom(source, '/' + name); return name; }
      finally { client.close(); }
    },
    start(machine, path, plate) {
      if (plate) return send(machine, 'project_file', { param: plate, url: 'ftp:///' + path, project_id: '0', profile_id: '0',
        task_id: '0', subtask_id: '0', subtask_name: path, bed_type: 'auto', bed_levelling: true,
        flow_cali: true, vibration_cali: true, layer_inspect: false, timelapse: false, use_ams: false });
      return send(machine, 'gcode_file', { param: '/' + path });
    }
  };
}
