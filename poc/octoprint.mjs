import { moonrakerOrigin, readResponse } from './connector-http.mjs';

const states = new Map([
  ['operational', 'ready'], ['printing', 'printing'], ['paused', 'paused'], ['pausing', 'paused'],
  ['resuming', 'printing'], ['starting', 'printing'], ['finishing', 'printing'], ['cancelling', 'printing'],
  ['offline', 'offline'], ['closed', 'offline'], ['open serial port', 'connecting'],
  ['connecting', 'connecting'], ['detecting serial connection', 'connecting'],
  ['error', 'error'], ['closed with error', 'error']
]);

const unavailable = (status, issue) => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });
const temperature = (value) => Number.isFinite(value) ? Math.round(value * 10) / 10 : null;

export async function readOctoPrint(machine, { fetcher = fetch, signal } = {}) {
  if (moonrakerOrigin(machine.origin) !== machine.origin || !/^[!-~]{1,256}$/.test(machine.apiKey ?? '')) {
    return unavailable('error', 'octoprint-access');
  }
  const timeout = AbortSignal.timeout(3000);
  const options = {
    method: 'GET', redirect: 'error', headers: { 'X-Api-Key': machine.apiKey },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout
  };
  try {
    const jobResponse = await fetcher(machine.origin + '/api/job', options);
    if (!jobResponse.ok) {
      await jobResponse.body?.cancel();
      return unavailable('error', [401, 403].includes(jobResponse.status) ? 'octoprint-access' : 'octoprint-response');
    }
    const job = await readResponse(jobResponse);
    const state = typeof job?.state === 'string' ? job.state.trim().toLowerCase() : '';
    const status = states.get(state);
    if (!status) return unavailable('error', 'octoprint-response');
    if (status === 'offline') return unavailable(status, 'octoprint-disconnected');
    if (status === 'error') return unavailable(status, 'octoprint-printer-error');

    const printerResponse = await fetcher(machine.origin + '/api/printer', options);
    if (!printerResponse.ok) {
      await printerResponse.body?.cancel();
      if (printerResponse.status === 409) return unavailable('offline', 'octoprint-disconnected');
      return unavailable('error', [401, 403].includes(printerResponse.status) ? 'octoprint-access' : 'octoprint-response');
    }
    const printer = await readResponse(printerResponse);
    if (!printer?.state?.flags && !printer?.temperature) return unavailable('error', 'octoprint-response');
    const active = status === 'printing' || status === 'paused';
    const progress = job.progress?.completion;
    const file = job.job?.file?.display || job.job?.file?.name;
    return {
      status,
      issue: null,
      nozzle: temperature(printer?.temperature?.tool0?.actual),
      bed: temperature(printer?.temperature?.bed?.actual),
      progress: active && Number.isFinite(progress) ? Math.round(Math.max(0, Math.min(100, progress))) : 0,
      file: active && typeof file === 'string' ? file.slice(0, 200) : ''
    };
  } catch (error) {
    return error instanceof SyntaxError ? unavailable('error', 'octoprint-response') : unavailable('offline', 'octoprint-connection');
  }
}

// Terminal : l’API REST d’OctoPrint confirme la mise en file de la commande, pas son exécution ni la réponse de l’imprimante.
export async function sendOctoPrintGcode(machine, script, fetcher = fetch) {
  if (moonrakerOrigin(machine.origin) !== machine.origin || !/^[!-~]{1,256}$/.test(machine.apiKey ?? '')) {
    return { outcome: 'rejected', message: '' };
  }
  const response = await fetcher(machine.origin + '/api/printer/command', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: { 'X-Api-Key': machine.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: [script] })
  });
  await response.body?.cancel();
  if (response.status === 204 || response.ok) return { outcome: 'accepted', responses: null };
  if (response.status >= 500) throw new Error('OctoPrint gcode outcome unknown');
  return { outcome: 'rejected', message: response.status === 409 ? 'octoprint-disconnected' : '' };
}
