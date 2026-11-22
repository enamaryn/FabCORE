import type { HttpFilePorts, MachineFile } from '../../../packages/connector-sdk/src/index.ts';

export interface PrusaLinkConnection { origin: string; apiKey?: string | undefined }
export type PrusaLinkStatus = 'connecting' | 'ready' | 'printing' | 'paused' | 'done' | 'error' | 'offline';
/** Forme POC préservée ; conversion vers la télémétrie commune par l'adaptateur du registre. */
export interface PrusaLinkSnapshot {
  status: PrusaLinkStatus;
  issue: string | null;
  nozzle: number | null;
  bed: number | null;
  progress: number;
  file: string;
}
export type PrusaLinkRequest = RequestInit & { duplex?: 'half' };
export type PrusaLinkFetch = (url: string, options: PrusaLinkRequest) => Promise<Response>;
export type PrusaLinkPorts = Pick<HttpFilePorts, 'validOrigin' | 'readResponse' | 'encodePath' | 'filePath'>;

interface Status { printer?: { state?: unknown; temp_nozzle?: unknown; temp_bed?: unknown }; job?: { progress?: unknown } | null }
interface Storage { path?: unknown; available?: unknown; read_only?: unknown }
interface Entry { name?: unknown; type?: unknown; size?: unknown; m_timestamp?: unknown }

const statuses = new Map<unknown, PrusaLinkStatus>([
  ['IDLE', 'ready'], ['READY', 'ready'], ['PRINTING', 'printing'], ['PAUSED', 'paused'],
  ['BUSY', 'connecting'], ['FINISHED', 'done'], ['STOPPED', 'ready'],
  ['ATTENTION', 'error'], ['ERROR', 'error'], ['OFFLINE', 'offline'],
]);
const finite = (value: unknown): value is number => Number.isFinite(value);
const unavailable = (status: PrusaLinkStatus, issue: string): PrusaLinkSnapshot => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });
const temperature = (value: unknown) => finite(value) ? value : null;
const validKey = (key: unknown): key is string => typeof key === 'string' && /^[!-~]{1,256}$/.test(key);
const storagePath = (path: unknown): path is string => typeof path === 'string' && /^\/[a-zA-Z0-9_-]+\/?$/.test(path);

/** Protocole PrusaLink unique (API v1, clé `X-Api-Key`), sans import du cœur ou du POC. */
export function createPrusaLinkServices({ validOrigin, readResponse, encodePath, filePath }: PrusaLinkPorts) {
  const valid = (machine: PrusaLinkConnection) => validOrigin(machine.origin) === machine.origin && validKey(machine.apiKey);

  async function readPrusaLink(machine: PrusaLinkConnection, { fetcher = fetch as PrusaLinkFetch, signal }: { fetcher?: PrusaLinkFetch; signal?: AbortSignal | undefined } = {}): Promise<PrusaLinkSnapshot> {
    if (!valid(machine)) return unavailable('error', 'prusalink-access');
    const timeout = AbortSignal.timeout(3000);
    const options: PrusaLinkRequest = { method: 'GET', redirect: 'error', headers: { 'X-Api-Key': machine.apiKey! },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout };
    try {
      const response = await fetcher(machine.origin + '/api/v1/status', options);
      if (!response.ok) {
        await response.body?.cancel();
        return unavailable('error', [401, 403].includes(response.status) ? 'prusalink-access' : 'prusalink-response');
      }
      const { printer, job } = (await readResponse(response) as Status | null) ?? {};
      const status = statuses.get(printer?.state);
      if (!printer || !status) return unavailable('error', 'prusalink-response');
      let file = '';
      if (job && (status === 'printing' || status === 'paused')) {
        try {
          const details = await fetcher(machine.origin + '/api/v1/job', options);
          if (details.ok) {
            const value = (await readResponse(details) as { file?: { display_name?: unknown; name?: unknown } } | null)?.file;
            const name = value?.display_name ?? value?.name;
            if (typeof name === 'string') file = name.slice(0, 200);
          } else await details.body?.cancel();
        } catch { /* Les détails du fichier sont facultatifs quand l'état est disponible. */ }
      }
      const progress = job?.progress;
      return {
        status, issue: status === 'error' ? 'prusalink-printer-error' : null,
        nozzle: temperature(printer.temp_nozzle), bed: temperature(printer.temp_bed),
        progress: finite(progress) ? Math.round(Math.max(0, Math.min(100, progress))) : 0,
        file,
      };
    } catch (error) {
      return error instanceof SyntaxError ? unavailable('error', 'prusalink-response') : unavailable('offline', 'prusalink-connection');
    }
  }

  /** Commandes et fichiers ; une erreur serveur laisse l'issue inconnue, jamais renvoyée. */
  function createPrusaOperations(fetcher: PrusaLinkFetch = fetch) {
    function call(machine: PrusaLinkConnection, path: string, options: PrusaLinkRequest = {}) {
      if (!valid(machine)) throw new Error('invalid-machine');
      return fetcher(machine.origin + path, { redirect: 'error', ...options,
        headers: { 'X-Api-Key': machine.apiKey!, ...options.headers as Record<string, string> }, signal: options.signal ?? AbortSignal.timeout(15000) });
    }
    async function json<T>(machine: PrusaLinkConnection, path: string): Promise<T> {
      const response = await call(machine, path);
      if (!response.ok) { await response.body?.cancel(); throw new Error('prusalink-response'); }
      return await readResponse(response) as T;
    }
    async function accepted(machine: PrusaLinkConnection, path: string, options: PrusaLinkRequest) {
      const response = await call(machine, path, options);
      await response.body?.cancel();
      if (response.status >= 500) throw new Error('command-unconfirmed');
      return response.ok;
    }
    return {
      async command(machine: PrusaLinkConnection, action: string) {
        if (!['pause', 'resume', 'stop'].includes(action)) return false;
        const job = await json<{ id?: unknown } | null>(machine, '/api/v1/job');
        if (!Number.isSafeInteger(job?.id)) return false;
        return accepted(machine, '/api/v1/job/' + String(job!.id) + (action === 'stop' ? '' : '/' + action), { method: action === 'stop' ? 'DELETE' : 'PUT' });
      },
      files: {
        async list(machine: PrusaLinkConnection) {
          const { storage_list: storage } = await json<{ storage_list?: unknown }>(machine, '/api/v1/storage');
          if (!Array.isArray(storage)) throw new Error('prusalink-response');
          const out: MachineFile[] = [];
          let directories = 0;
          async function walk(path: string, depth = 0): Promise<void> {
            if (depth > 6 || ++directories > 40) return;
            const folder = await json<{ children?: Entry[] }>(machine, '/api/v1/files/' + encodePath(path) + '/');
            for (const entry of (folder.children ?? []).slice(0, 300)) {
              if (out.length >= 300) return;
              if (typeof entry.name !== 'string' || entry.name.includes('/') || !filePath(entry.name + '.gcode')) continue;
              const target = path + '/' + entry.name;
              if (entry.type === 'FOLDER') await walk(target, depth + 1);
              else if (filePath(target)) out.push({ path: target, size: (entry.size ?? null) as number | null, modified: finite(entry.m_timestamp) ? entry.m_timestamp * 1000 : null });
            }
          }
          for (const entry of storage as Storage[]) if (storagePath(entry.path) && entry.available !== false) await walk(entry.path.replace(/^\/|\/$/g, ''));
          return out;
        },
        async download(machine: PrusaLinkConnection, path: string, signal?: AbortSignal) {
          const info = await json<{ refs?: { download?: unknown } }>(machine, '/api/v1/files/' + encodePath(path));
          const url = new URL(info.refs?.download as string, machine.origin);
          if (url.origin !== machine.origin || url.username || url.password || !/^\/(usb|local|sdcard)\//.test(url.pathname)) throw new Error('invalid-download');
          return call(machine, url.pathname + url.search, signal ? { signal } : {});
        },
        async upload(machine: PrusaLinkConnection, name: string, source: NonNullable<RequestInit['body']>, size: number) {
          const storage = (await json<{ storage_list?: Storage[] }>(machine, '/api/v1/storage')).storage_list?.find(entry => entry.available !== false && entry.read_only === false && storagePath(entry.path));
          if (!storage) return null;
          const path = (storage.path as string).replace(/^\/|\/$/g, '') + '/' + name;
          return await accepted(machine, '/api/v1/files/' + encodePath(path), { method: 'PUT', body: source, duplex: 'half',
            headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size), 'Print-After-Upload': '?0', Overwrite: '?0' } }) ? path : null;
        },
        start: (machine: PrusaLinkConnection, path: string) => accepted(machine, '/api/v1/files/' + encodePath(path), { method: 'POST' }),
      },
    };
  }

  return { readPrusaLink, createPrusaOperations };
}
