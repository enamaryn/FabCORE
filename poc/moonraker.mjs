import { isIPv4 } from 'node:net';

const query = '/printer/objects/query?webhooks&print_stats&virtual_sdcard&extruder&heater_bed';
const statuses = new Map([
  ['standby', 'ready'], ['printing', 'printing'], ['paused', 'paused'],
  ['complete', 'done'], ['cancelled', 'ready'], ['error', 'error']
]);

export function privateIPv4(host) {
  if (!isIPv4(host)) return false;
  const [a, b] = host.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function moonrakerOrigin(input) {
  let url;
  try { url = new URL(input); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || url.port === '0' || !privateIPv4(url.hostname)) return null;
  return url.origin;
}

function temperature(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function unavailable(status, issue) {
  return { status, issue, nozzle: null, bed: null, progress: 0, file: '' };
}

export async function readResponse(response) {
  if (!response.body) throw new SyntaxError('Réponse JSON vide.');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 64 * 1024) {
        await reader.cancel();
        throw new SyntaxError('Réponse JSON trop volumineuse.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
