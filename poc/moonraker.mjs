import { moonrakerOrigin, readResponse } from './connector-http.mjs';
export { privateIPv4, moonrakerOrigin, readResponse } from './connector-http.mjs';

const query = '/printer/objects/query?webhooks&print_stats&virtual_sdcard&extruder&heater_bed';
const statuses = new Map([
  ['standby', 'ready'], ['printing', 'printing'], ['paused', 'paused'],
  ['complete', 'done'], ['cancelled', 'ready'], ['error', 'error']
]);

function temperature(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function unavailable(status, issue) {
  return { status, issue, nozzle: null, bed: null, progress: 0, file: '' };
}

export async function readMoonraker(machine, fetcher = fetch) {
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

    const objects = (await readResponse(response))?.result?.status;
    if (objects?.webhooks?.state === 'startup') return unavailable('connecting', 'klippy');
    if (objects?.webhooks?.state !== 'ready') return unavailable('error', 'klippy');
    const print = objects.print_stats;
    const status = statuses.get(print?.state);
    if (!status) return unavailable('error', 'print_stats');

    const progress = objects.virtual_sdcard?.progress;
    return {
      status,
      issue: status === 'error' ? 'print' : null,
      nozzle: temperature(objects.extruder?.temperature),
      bed: temperature(objects.heater_bed?.temperature),
      progress: status === 'done' ? 100 : Number.isFinite(progress) ? Math.round(Math.max(0, Math.min(1, progress)) * 100) : 0,
      file: typeof print.filename === 'string' ? print.filename.slice(0, 200) : ''
    };
  } catch (error) {
    return error instanceof SyntaxError ? unavailable('error', 'moonraker') : unavailable('offline', 'connection');
  }
}

const printCommands = new Map([['pause', '/printer/print/pause'], ['resume', '/printer/print/resume']]);

export async function commandMoonraker(machine, action, fetcher = fetch) {
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
  if ((await readResponse(response))?.result !== 'ok') throw new Error('Moonraker command outcome unknown');
  return true;
}

// Terminal : Moonraker répond une fois le script exécuté par Klipper. Les réponses sont relues dans gcode_store.
export async function sendMoonrakerGcode(machine, script, fetcher = fetch) {
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
    try { message = String((await readResponse(response))?.error?.message ?? ''); } catch { /* corps illisible */ }
    return { outcome: 'rejected', message: message.slice(0, 500) };
  }
  if ((await readResponse(response))?.result !== 'ok') throw new Error('Moonraker gcode outcome unknown');
  let responses = null;
  try {
    const store = await fetcher(machine.origin + '/server/gcode_store?count=50', {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(2500), headers
    });
    if (store.ok) {
      const entries = (await readResponse(store))?.result?.gcode_store;
      if (Array.isArray(entries)) {
        const sent = entries.findLastIndex(entry => entry?.type === 'command' && entry.message === script);
        if (sent !== -1) {
          responses = entries.slice(sent + 1)
            .filter(entry => entry?.type === 'response' && typeof entry.message === 'string')
            .slice(0, 30).map(entry => entry.message.slice(0, 500));
        }
      }
    } else await store.body?.cancel();
  } catch { /* La commande est exécutée ; seules les réponses manquent. */ }
  return { outcome: 'executed', responses };
}
