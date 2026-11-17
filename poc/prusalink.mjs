import { moonrakerOrigin, readResponse } from './connector-http.mjs';

const statuses = new Map([
  ['IDLE', 'ready'], ['READY', 'ready'], ['PRINTING', 'printing'], ['PAUSED', 'paused'],
  ['BUSY', 'connecting'], ['FINISHED', 'done'], ['STOPPED', 'ready'],
  ['ATTENTION', 'error'], ['ERROR', 'error'], ['OFFLINE', 'offline']
]);
const unavailable = (status, issue) => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });
const temperature = value => Number.isFinite(value) ? value : null;

export async function readPrusaLink(machine, { fetcher = fetch, signal } = {}) {
  if (moonrakerOrigin(machine.origin) !== machine.origin || !/^[!-~]{1,256}$/.test(machine.apiKey ?? '')) {
    return unavailable('error', 'prusalink-access');
  }
  const timeout = AbortSignal.timeout(3000);
  const options = { method: 'GET', redirect: 'error', headers: { 'X-Api-Key': machine.apiKey },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout };
  try {
    const response = await fetcher(machine.origin + '/api/v1/status', options);
    if (!response.ok) {
      await response.body?.cancel();
      return unavailable('error', [401, 403].includes(response.status) ? 'prusalink-access' : 'prusalink-response');
    }
    const { printer, job } = await readResponse(response) ?? {};
    const status = statuses.get(printer?.state);
    if (!status) return unavailable('error', 'prusalink-response');
    let file = '';
    if (job && (status === 'printing' || status === 'paused')) {
      try {
        const details = await fetcher(machine.origin + '/api/v1/job', options);
        if (details.ok) {
          const value = (await readResponse(details))?.file;
          const name = value?.display_name ?? value?.name;
          if (typeof name === 'string') file = name.slice(0, 200);
        } else await details.body?.cancel();
      } catch { /* File details are optional when status is available. */ }
    }
    return {
      status, issue: status === 'error' ? 'prusalink-printer-error' : null,
      nozzle: temperature(printer.temp_nozzle), bed: temperature(printer.temp_bed),
      progress: Number.isFinite(job?.progress) ? Math.round(Math.max(0, Math.min(100, job.progress))) : 0,
      file
    };
  } catch (error) {
    return error instanceof SyntaxError ? unavailable('error', 'prusalink-response') : unavailable('offline', 'prusalink-connection');
  }
}
