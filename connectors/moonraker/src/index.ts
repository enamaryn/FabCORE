import { sameHostStream, type HttpFilePorts, type MachineFile } from '../../../packages/connector-sdk/src/index.ts';
import type { MoonrakerConnection, MoonrakerStatus, MoonrakerSnapshot, MoonrakerFetch, MoonrakerRequest, MoonrakerObjects, MoonrakerReply, MoonrakerFile, MoonrakerGcodeResult, GcodeEntry } from './types.ts';

/** Protocole Moonraker unique, sans import du cœur ou du POC. Helpers partagés injectés. */
export function createMoonrakerServices({ encodePath, filePath, validOrigin: moonrakerOrigin, multipart, readResponse }: HttpFilePorts) {
  const decode = async <T>(response: Response): Promise<MoonrakerReply<T> | null> => await readResponse(response) as MoonrakerReply<T> | null;
  const query = '/printer/objects/query?webhooks&print_stats&virtual_sdcard&extruder&heater_bed';
  const statuses = new Map<string | undefined, MoonrakerStatus>([
    ['standby', 'ready'], ['printing', 'printing'], ['paused', 'paused'],
    ['complete', 'done'], ['cancelled', 'ready'], ['error', 'error']
  ]);

  const finite = (value: unknown): value is number => Number.isFinite(value);

  function temperature(value: unknown) {
    return finite(value) ? Math.round(value * 10) / 10 : null;
  }

  function unavailable(status: MoonrakerStatus, issue: string, message?: unknown): MoonrakerSnapshot {
    const nativeMessage = text(message);
    return { status, issue, nozzle: null, bed: null, progress: 0, file: '', ...(nativeMessage ? { nativeMessage } : {}) };
  }
  // Message Klipper affiché tel quel (texte brut) : une ligne, 300 caractères au plus.
  function text(value: unknown) {
    if (typeof value !== 'string') return '';
    return [...value].map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join('').replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  async function readMoonraker(machine: MoonrakerConnection, fetcher: MoonrakerFetch = fetch): Promise<MoonrakerSnapshot> {
    try {
      const response = await fetcher(machine.origin + query, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(1500),
        headers: machine.apiKey ? { 'X-Api-Key': machine.apiKey } : {}
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) return unavailable('error', 'access');
        return unavailable('error', 'moonraker');
      }

      const objects = (await decode<{ status?: MoonrakerObjects }>(response))?.result?.status;
      if (objects?.webhooks?.state === 'startup') return unavailable('connecting', 'klippy');
      if (objects?.webhooks?.state === 'shutdown') return unavailable('error', 'moonraker-shutdown', objects.webhooks.state_message);
      if (objects?.webhooks?.state !== 'ready') return unavailable('error', 'klippy', objects?.webhooks?.state_message);
      const print = objects.print_stats ?? {};
      const status = statuses.get(print?.state);
      if (!status) return unavailable('error', 'print_stats');

      const progress = objects.virtual_sdcard?.progress;
      const position = objects.virtual_sdcard?.file_position;
      const active = status === 'printing' || status === 'paused';
      const live = active && typeof print.filename === 'string' && print.filename.length <= 255 && finite(position)
        ? { filePath: print.filename, filePosition: position } : {};
      return {
        status,
        issue: status === 'error' ? 'print' : null,
        nozzle: temperature(objects.extruder?.temperature),
        bed: temperature(objects.heater_bed?.temperature),
        progress: status === 'done' ? 100 : finite(progress) ? Math.round(Math.max(0, Math.min(1, progress)) * 100) : 0,
        file: typeof print.filename === 'string' ? print.filename.slice(0, 200) : '',
        ...(status === 'error' && text(print.message) ? { nativeMessage: text(print.message) } : {}),
        ...live
      };
    } catch (error) {
      return error instanceof SyntaxError ? unavailable('error', 'moonraker') : unavailable('offline', 'connection');
    }
  }

  const printCommands = new Map<string, string>([['pause', '/printer/print/pause'], ['resume', '/printer/print/resume'], ['stop', '/printer/print/cancel']]);

  async function commandMoonraker(machine: MoonrakerConnection, action: string, fetcher: MoonrakerFetch = fetch) {
    const endpoint = printCommands.get(action);
    if (!endpoint || moonrakerOrigin(machine.origin) !== machine.origin) return false;
    const response = await fetcher(machine.origin + endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(2500),
      headers: machine.apiKey ? { 'X-Api-Key': machine.apiKey } : {}
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status >= 500) throw new Error('Moonraker command outcome unknown');
      return false;
    }
    if ((await decode<unknown>(response))?.result !== 'ok') throw new Error('Moonraker command outcome unknown');
    return true;
  }

  /** Native API, never G-code, never retried. An ACK is not a physical shutdown measurement. */
  async function emergencyStopMoonraker(machine: MoonrakerConnection, fetcher: MoonrakerFetch = fetch) {
    if (moonrakerOrigin(machine.origin) !== machine.origin) return { outcome: 'rejected' as const };
    let nativeCode: number | undefined;
    try {
      const response = await fetcher(machine.origin + '/printer/emergency_stop', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2500),
        headers: machine.apiKey ? { 'X-Api-Key': machine.apiKey } : {},
      });
      nativeCode = response.status;
      if (!response.ok) {
        await response.body?.cancel();
        return { outcome: response.status >= 500 ? 'unknown' as const : 'rejected' as const, nativeCode };
      }
      const body = await decode<unknown>(response);
      return { outcome: body?.result === 'ok' ? 'accepted' as const : 'unknown' as const, nativeCode };
    } catch { return { outcome: 'unknown' as const, ...(nativeCode === undefined ? {} : { nativeCode }) }; }
  }

  // Fichiers du dossier gcodes de Moonraker : liste, lecture pour le visualiseur, envoi et lancement d’une impression.
  function createMoonrakerFiles(fetcher: MoonrakerFetch = fetch) {
    const call = (machine: MoonrakerConnection, path: string, options: MoonrakerRequest = {}) => {
      if (moonrakerOrigin(machine.origin) !== machine.origin) throw new Error('invalid origin');
      return fetcher(machine.origin + path, {
        redirect: 'error', ...options,
        headers: { ...(machine.apiKey ? { 'X-Api-Key': machine.apiKey } : {}), ...options.headers }
      });
    };
    return {
      async list(machine: MoonrakerConnection): Promise<MachineFile[]> {
        const response = await call(machine, '/server/files/list?root=gcodes', { method: 'GET', signal: AbortSignal.timeout(5000) });
        if (!response.ok) { await response.body?.cancel(); throw new Error('list ' + response.status); }
        const entries = (await decode<unknown>(response))?.result;
        if (!Array.isArray(entries)) throw new Error('list');
        return (entries as MoonrakerFile[]).filter(entry => filePath(entry?.path)).map(({ path, size, modified }) => ({
          path, size: finite(size) ? size : null, modified: finite(modified) ? modified * 1000 : null
        }));
      },
      download: (machine: MoonrakerConnection, path: string, signal?: AbortSignal) => call(machine, '/server/files/gcodes/' + encodePath(path), { method: 'GET', ...(signal ? { signal } : {}) }),
      async upload(machine: MoonrakerConnection, name: string, source: AsyncIterable<Uint8Array>, size: number) {
        const form = multipart('file', name, source, size, { root: 'gcodes' });
        const response = await call(machine, '/server/files/upload', { method: 'POST', body: form.body, duplex: 'half', headers: form.headers });
        if (!response.ok) { await response.body?.cancel(); return null; }
        const body = await decode<{ item?: { path?: unknown } }>(response);
        const path = (body?.result ?? body)?.item?.path;
        return filePath(path) ?? name;
      },
      async start(machine: MoonrakerConnection, path: string) {
        const response = await call(machine, '/printer/print/start?filename=' + encodeURIComponent(path), { method: 'POST', signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status >= 500) throw new Error('start outcome unknown');
          return false;
        }
        if ((await decode<unknown>(response))?.result !== 'ok') throw new Error('start outcome unknown');
        return true;
      }
    };
  }

  // Terminal : Moonraker répond une fois le script exécuté par Klipper. Les réponses sont relues dans gcode_store.
  /** Réponses du terminal : 100 messages, 8 000 caractères chacun, 64 000 au total. */
  const terminalLimits = { responses: 100, length: 8000, total: 64000 };
  async function sendMoonrakerGcode(machine: MoonrakerConnection, script: string, fetcher: MoonrakerFetch = fetch): Promise<MoonrakerGcodeResult> {
    if (moonrakerOrigin(machine.origin) !== machine.origin) return { outcome: 'rejected', message: '' };
    const headers = machine.apiKey ? { 'X-Api-Key': machine.apiKey } : {};
    const response = await fetcher(machine.origin + '/printer/gcode/script', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ script })
    });
    if (!response.ok) {
      if (response.status >= 500) {
        await response.body?.cancel();
        throw new Error('Moonraker gcode outcome unknown');
      }
      let message = '';
      try { message = String((await decode<unknown>(response))?.error?.message ?? ''); } catch { /* corps illisible */ }
      return { outcome: 'rejected', message: message.slice(0, 500) };
    }
    if ((await decode<unknown>(response))?.result !== 'ok') throw new Error('Moonraker gcode outcome unknown');
    let responses: string[] | null = null;
    try {
      const store = await fetcher(machine.origin + '/server/gcode_store?count=200', {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(2500), headers
      });
      if (store.ok) {
        const entries = (await decode<{ gcode_store?: unknown }>(store))?.result?.gcode_store;
        if (Array.isArray(entries)) {
          const lines = entries as GcodeEntry[];
          const sent = lines.findLastIndex(entry => entry?.type === 'command' && entry.message === script);
          if (sent !== -1) {
            responses = lines.slice(sent + 1)
              .filter((entry): entry is GcodeEntry & { message: string } => entry?.type === 'response' && typeof entry.message === 'string')
              .slice(0, terminalLimits.responses).map(entry => entry.message.slice(0, terminalLimits.length));
            // Plafond global : les réponses longues (HELP, listes de macros) restent lisibles sans réponse géante.
            let total = 0;
            responses = responses.filter(message => (total += message.length) <= terminalLimits.total);
          }
        }
      } else await store.body?.cancel();
    } catch { /* La commande est exécutée ; seules les réponses manquent. */ }
    return { outcome: 'executed', responses };
  }

  /**
   * Flux caméra déclaré par Moonraker (`/server/webcams/list`) : première caméra active, services MJPEG d'abord.
   * Une URL relative est servie par l'interface web (port 80) du même hôte.
   */
  async function moonrakerWebcam(machine: MoonrakerConnection, fetcher: MoonrakerFetch = fetch): Promise<URL | null> {
    if (moonrakerOrigin(machine.origin) !== machine.origin) return null;
    const response = await fetcher(machine.origin + '/server/webcams/list', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(3000), headers: machine.apiKey ? { 'X-Api-Key': machine.apiKey } : {},
    });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const webcams = (await decode<{ webcams?: unknown }>(response))?.result?.webcams;
    if (!Array.isArray(webcams)) return null;
    const active = (webcams as { enabled?: unknown; service?: unknown; stream_url?: unknown }[]).filter(cam => cam && cam.enabled !== false).slice(0, 16);
    const ordered = [...active.filter(cam => typeof cam.service === 'string' && /mjpeg/i.test(cam.service)), ...active.filter(cam => !(typeof cam.service === 'string' && /mjpeg/i.test(cam.service)))];
    const base = `http://${new URL(machine.origin).hostname}/`;
    for (const cam of ordered) {
      const url = sameHostStream(cam.stream_url, base, machine.origin, moonrakerOrigin);
      if (url) return url;
    }
    return null;
  }

  return { readMoonraker, commandMoonraker, emergencyStopMoonraker, createMoonrakerFiles, sendMoonrakerGcode, moonrakerWebcam };
}
