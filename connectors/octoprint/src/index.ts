import { sameHostStream, type HttpFilePorts, type MachineFile } from '../../../packages/connector-sdk/src/index.ts';

export interface OctoPrintConnection { origin: string; apiKey?: string | undefined }
export type OctoPrintStatus = 'connecting' | 'ready' | 'printing' | 'paused' | 'error' | 'offline';
/** Forme POC préservée ; conversion vers la télémétrie commune par l'adaptateur du registre. */
export interface OctoPrintSnapshot {
  status: OctoPrintStatus;
  issue: string | null;
  nozzle: number | null;
  bed: number | null;
  progress: number;
  file: string;
  filePath?: string;
  filePosition?: number;
}
export type OctoPrintRequest = RequestInit & { duplex?: 'half' };
export type OctoPrintFetch = (url: string, options: OctoPrintRequest) => Promise<Response>;
export type OctoPrintGcodeResult = { outcome: 'rejected'; message: string } | { outcome: 'accepted'; responses: null };

interface Job {
  state?: unknown;
  progress?: { completion?: unknown; filepos?: unknown };
  job?: { file?: { display?: unknown; name?: unknown; path?: unknown; origin?: unknown } };
}
interface Printer { state?: { flags?: unknown }; temperature?: { tool0?: { actual?: unknown }; bed?: { actual?: unknown } } }
interface Entry { type?: unknown; path?: unknown; size?: unknown; date?: unknown; children?: unknown }

const states = new Map<string, OctoPrintStatus>([
  ['operational', 'ready'], ['printing', 'printing'], ['paused', 'paused'], ['pausing', 'paused'],
  ['resuming', 'printing'], ['starting', 'printing'], ['finishing', 'printing'], ['cancelling', 'printing'],
  ['offline', 'offline'], ['closed', 'offline'], ['open serial port', 'connecting'],
  ['connecting', 'connecting'], ['detecting serial connection', 'connecting'],
  ['error', 'error'], ['closed with error', 'error'],
]);
const finite = (value: unknown): value is number => Number.isFinite(value);
const unavailable = (status: OctoPrintStatus, issue: string): OctoPrintSnapshot => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });
const temperature = (value: unknown) => finite(value) ? Math.round(value * 10) / 10 : null;
const validKey = (key: unknown): key is string => typeof key === 'string' && /^[!-~]{1,256}$/.test(key);

/** Protocole OctoPrint unique (API REST, clé `X-Api-Key`), sans import du cœur ou du POC. */
export function createOctoPrintServices({ encodePath, filePath, validOrigin, multipart, readResponse }: HttpFilePorts) {
  const valid = (machine: OctoPrintConnection) => validOrigin(machine.origin) === machine.origin && validKey(machine.apiKey);

  async function readOctoPrint(machine: OctoPrintConnection, { fetcher = fetch as OctoPrintFetch, signal }: { fetcher?: OctoPrintFetch; signal?: AbortSignal | undefined } = {}): Promise<OctoPrintSnapshot> {
    if (!valid(machine)) return unavailable('error', 'octoprint-access');
    const timeout = AbortSignal.timeout(3000);
    const options: OctoPrintRequest = {
      method: 'GET', redirect: 'error', headers: { 'X-Api-Key': machine.apiKey! },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    };
    try {
      const jobResponse = await fetcher(machine.origin + '/api/job', options);
      if (!jobResponse.ok) {
        await jobResponse.body?.cancel();
        return unavailable('error', [401, 403].includes(jobResponse.status) ? 'octoprint-access' : 'octoprint-response');
      }
      const job = await readResponse(jobResponse) as Job | null;
      const state = typeof job?.state === 'string' ? job.state.trim().toLowerCase() : '';
      const status = states.get(state);
      if (!job || !status) return unavailable('error', 'octoprint-response');
      if (status === 'offline') return unavailable(status, 'octoprint-disconnected');
      if (status === 'error') return unavailable(status, 'octoprint-printer-error');

      const printerResponse = await fetcher(machine.origin + '/api/printer', options);
      if (!printerResponse.ok) {
        await printerResponse.body?.cancel();
        if (printerResponse.status === 409) return unavailable('offline', 'octoprint-disconnected');
        return unavailable('error', [401, 403].includes(printerResponse.status) ? 'octoprint-access' : 'octoprint-response');
      }
      const printer = await readResponse(printerResponse) as Printer | null;
      if (!printer?.state?.flags && !printer?.temperature) return unavailable('error', 'octoprint-response');
      const active = status === 'printing' || status === 'paused';
      const progress = job.progress?.completion;
      const file = job.job?.file?.display || job.job?.file?.name;
      const path = job.job?.file?.path;
      const position = job.progress?.filepos;
      const live = active && job.job?.file?.origin === 'local' && typeof path === 'string' && path.length <= 255 && finite(position)
        ? { filePath: path, filePosition: position } : {};
      return {
        status,
        issue: null,
        nozzle: temperature(printer.temperature?.tool0?.actual),
        bed: temperature(printer.temperature?.bed?.actual),
        progress: active && finite(progress) ? Math.round(Math.max(0, Math.min(100, progress))) : 0,
        file: active && typeof file === 'string' ? file.slice(0, 200) : '',
        ...live,
      };
    } catch (error) {
      return error instanceof SyntaxError ? unavailable('error', 'octoprint-response') : unavailable('offline', 'octoprint-connection');
    }
  }

  /** Stockage local : liste, lecture pour le visualiseur, envoi et lancement d'une impression. */
  function createOctoPrintFiles(fetcher: OctoPrintFetch = fetch) {
    const call = (machine: OctoPrintConnection, path: string, options: OctoPrintRequest = {}) => {
      if (!valid(machine)) throw new Error('invalid machine');
      return fetcher(machine.origin + path, { redirect: 'error', ...options, headers: { 'X-Api-Key': machine.apiKey!, ...options.headers as Record<string, string> } });
    };
    const flatten = (entries: unknown, out: MachineFile[] = []): MachineFile[] => {
      for (const entry of Array.isArray(entries) ? entries as Entry[] : []) {
        if (entry?.type === 'folder') flatten(entry.children, out);
        else if (entry?.type === 'machinecode' && filePath(entry.path)) {
          out.push({ path: entry.path as string, size: finite(entry.size) ? entry.size : null, modified: finite(entry.date) ? entry.date * 1000 : null });
        }
      }
      return out;
    };
    return {
      async list(machine: OctoPrintConnection) {
        const response = await call(machine, '/api/files/local?recursive=true', { method: 'GET', signal: AbortSignal.timeout(5000) });
        if (!response.ok) { await response.body?.cancel(); throw new Error('list ' + response.status); }
        return flatten((await readResponse(response) as { files?: unknown } | null)?.files);
      },
      download: (machine: OctoPrintConnection, path: string, signal?: AbortSignal) =>
        call(machine, '/downloads/files/local/' + encodePath(path), { method: 'GET', ...(signal ? { signal } : {}) }),
      async upload(machine: OctoPrintConnection, name: string, source: AsyncIterable<Uint8Array>, size: number) {
        const form = multipart('file', name, source, size);
        const response = await call(machine, '/api/files/local', { method: 'POST', body: form.body, duplex: 'half', headers: form.headers });
        if (!response.ok) { await response.body?.cancel(); return null; }
        const path = (await readResponse(response) as { files?: { local?: { path?: unknown } } } | null)?.files?.local?.path;
        return filePath(path) ?? name;
      },
      async start(machine: OctoPrintConnection, path: string) {
        const response = await call(machine, '/api/files/local/' + encodePath(path), {
          method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'select', print: true }),
        });
        await response.body?.cancel();
        if (response.status >= 500) throw new Error('start outcome unknown');
        return response.ok;
      },
    };
  }

  /** Pause, reprise, annulation : une erreur serveur laisse l'issue inconnue, jamais renvoyée. */
  async function commandOctoPrint(machine: OctoPrintConnection, action: string, fetcher: OctoPrintFetch = fetch) {
    if (!['pause', 'resume', 'stop'].includes(action) || validOrigin(machine.origin) !== machine.origin) return false;
    const response = await fetcher(machine.origin + '/api/job', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { 'X-Api-Key': String(machine.apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'stop' ? { command: 'cancel' } : { command: 'pause', action }),
    });
    await response.body?.cancel();
    if (response.status >= 500) throw new Error('command-unconfirmed');
    return response.ok;
  }

  /** Terminal : l'API confirme la mise en file de la commande, pas son exécution ni la réponse de l'imprimante. */
  async function sendOctoPrintGcode(machine: OctoPrintConnection, script: string, fetcher: OctoPrintFetch = fetch): Promise<OctoPrintGcodeResult> {
    if (!valid(machine)) return { outcome: 'rejected', message: '' };
    const response = await fetcher(machine.origin + '/api/printer/command', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { 'X-Api-Key': machine.apiKey!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: [script] }),
    });
    await response.body?.cancel();
    if (response.status === 204 || response.ok) return { outcome: 'accepted', responses: null };
    if (response.status >= 500) throw new Error('OctoPrint gcode outcome unknown');
    return { outcome: 'rejected', message: response.status === 409 ? 'octoprint-disconnected' : '' };
  }

  /** Flux caméra déclaré dans les réglages OctoPrint (`webcam.streamUrl`), s'il est activé ; URL relative = même origine. */
  async function octoPrintWebcam(machine: OctoPrintConnection, fetcher: OctoPrintFetch = fetch): Promise<URL | null> {
    if (!valid(machine)) return null;
    const response = await fetcher(machine.origin + '/api/settings', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(3000), headers: { 'X-Api-Key': machine.apiKey! },
    });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const webcam = (await readResponse(response) as { webcam?: { webcamEnabled?: unknown; streamUrl?: unknown } } | null)?.webcam;
    if (!webcam || webcam.webcamEnabled === false) return null;
    return sameHostStream(webcam.streamUrl, machine.origin + '/', machine.origin, validOrigin);
  }

  return { readOctoPrint, createOctoPrintFiles, commandOctoPrint, sendOctoPrintGcode, octoPrintWebcam };
}
