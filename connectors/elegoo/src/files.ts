import type { Readable } from 'node:stream';
import type { MachineFile } from '../../../packages/connector-sdk/src/index.ts';
import type { CC2Connection, CC2Result } from './types.ts';

interface NativeFile { filename: string; type?: string; size?: number; create_time?: number }
interface FilePorts {
  fetcher: typeof fetch;
  filePath(path: string): string | false;
  privateIPv4(host: string): boolean;
  queryFiles?: ((machine: CC2Connection) => Promise<CC2Result>) | undefined;
  upload(machine: CC2Connection, name: string, source: Readable, size: number): Promise<string | null>;
}
type Request = (machine: CC2Connection, method: number, params: Record<string, unknown>) => Promise<boolean>;

/** Inventaire/lecture/lancement CC2 natifs ; transfert segmenté partagé injecté, jamais copié. */
export function createCC2Files(rpc: Request, { fetcher, queryFiles, filePath, privateIPv4, upload }: FilePorts) {
  const native = queryFiles ? {
    async list(machine: CC2Connection): Promise<MachineFile[]> {
      const result = await queryFiles(machine);
      if (!Array.isArray(result?.file_list)) throw new Error('files-unavailable');
      const entries = (result.file_list as NativeFile[]).slice(0, 300).filter(item => item && (!item.type || item.type === 'file') && filePath(item.filename) && !item.filename.includes('/'));
      return [...new Map(entries.map(item => [item.filename, { path: item.filename,
        size: Number.isSafeInteger(item.size) && item.size! >= 0 ? item.size! : null,
        modified: Number.isFinite(item.create_time) && item.create_time! > 0 && item.create_time! < 100000000000 ? item.create_time! * 1000 : null,
      }])).values()];
    },
    async download(machine: CC2Connection, path: string, signal?: AbortSignal) {
      if (!filePath(path) || path.includes('/')) throw new Error('invalid-file');
      const host = new URL(machine.origin).hostname;
      if (!privateIPv4(host)) throw new Error('invalid-machine');
      const url = new URL('/download', 'http://' + host);
      url.searchParams.set('file_name', path); url.searchParams.set('X-Token', machine.accessCode);
      const response = await fetcher(url, { redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
      if (!response.ok) return response;
      const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (type && ['text/html', 'application/json'].includes(type)) { await response.body?.cancel(); throw new Error('files-unavailable'); }
      return response;
    },
  } : {};
  return {
    ...native,
    async upload(machine: CC2Connection, name: string, source: Readable, size: number) {
      if (native.list && (await native.list(machine)).some(item => item.path === name)) throw new Error('file-exists');
      return upload(machine, name, source, size);
    },
    async start(machine: CC2Connection, path: string) {
      if (native.list && !(await native.list(machine)).some(item => item.path === path)) throw new Error('missing');
      return rpc(machine, 1020, { storage_media: 'local', filename: path,
        config: { delay_video: false, printer_check: true, print_layout: 'A', bedlevel_force: false, slot_map: [] } });
    },
  };
}
