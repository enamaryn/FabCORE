import { Client } from 'basic-ftp';
import { PassThrough, Readable } from 'node:stream';
import { checkServerIdentity, type PeerCertificate } from 'node:tls';
import type { MachineFile } from '../../../packages/connector-sdk/src/index.ts';
import type { P2SConnection, P2SFilePorts } from './types.ts';

type Send = (machine: P2SConnection, command: string, params: Record<string, unknown>) => Promise<boolean>;
type MakeClient = () => Client;

/** Fichiers P2S en FTPS implicite (port 990) ; le lancement passe par la session MQTT existante. */
export function createP2SFiles(send: Send, { ca, productionPath }: P2SFilePorts, makeClient: MakeClient = () => new Client(15000, { allowSeparateTransferHost: false })) {
  async function access(machine: P2SConnection) {
    if (machine.authorized && !machine.authorized()) throw new Error('cloud-auth');
    const client = makeClient();
    try {
      await client.access({ host: new URL(machine.origin).hostname, port: 990, user: 'bblp', password: machine.accessCode,
        secure: 'implicit', secureOptions: { ca, rejectUnauthorized: true, minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2',
          checkServerIdentity: (_host: string, certificate: PeerCertificate) => checkServerIdentity(machine.serial, certificate) } });
      if (machine.authorized && !machine.authorized()) throw new Error('cloud-auth');
      return client;
    } catch (error) { client.close(); throw error; }
  }
  return {
    async list(machine: P2SConnection): Promise<MachineFile[]> {
      const client = await access(machine);
      try {
        const entries: MachineFile[] = [];
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
    async download(machine: P2SConnection, path: string, signal?: AbortSignal) {
      const client = await access(machine);
      const stream = new PassThrough();
      const abort = () => { client.close(); stream.destroy(new Error('download-aborted')); };
      if (signal?.aborted) { client.close(); return new Response(null, { status: 499 }); }
      signal?.addEventListener('abort', abort, { once: true });
      stream.once('close', () => { if (!stream.readableEnded) client.close(); });
      void client.downloadTo(stream, '/' + path).catch((error: unknown) => stream.destroy(error as Error)).finally(() => {
        signal?.removeEventListener('abort', abort); client.close();
      });
      return new Response(Readable.toWeb(stream) as ReadableStream);
    },
    async upload(machine: P2SConnection, name: string, source: Readable) {
      const client = await access(machine);
      try { await client.uploadFrom(source, '/' + name); return name; }
      finally { client.close(); }
    },
    start(machine: P2SConnection, path: string, plate?: string) {
      if (plate) return send(machine, 'project_file', { param: plate, url: 'ftp:///' + path, project_id: '0', profile_id: '0',
        task_id: '0', subtask_id: '0', subtask_name: path, bed_type: 'auto', bed_levelling: true,
        flow_cali: true, vibration_cali: true, layer_inspect: false, timelapse: false, use_ams: false });
      return send(machine, 'gcode_file', { param: '/' + path });
    },
  };
}
