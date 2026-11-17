import { encodePath, filePath, moonrakerOrigin, multipart, readResponse } from './connector-http.mjs';

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
    const path = job.job?.file?.path;
    const position = job.progress?.filepos;
    const live = active && job.job?.file?.origin === 'local' && typeof path === 'string' && path.length <= 255 && Number.isFinite(position)
      ? { filePath: path, filePosition: position } : {};
    return {
      status,
      issue: null,
      nozzle: temperature(printer?.temperature?.tool0?.actual),
      bed: temperature(printer?.temperature?.bed?.actual),
      progress: active && Number.isFinite(progress) ? Math.round(Math.max(0, Math.min(100, progress))) : 0,
      file: active && typeof file === 'string' ? file.slice(0, 200) : '',
      ...live
    };
  } catch (error) {
    return error instanceof SyntaxError ? unavailable('error', 'octoprint-response') : unavailable('offline', 'octoprint-connection');
  }
}

// Fichiers du stockage local d’OctoPrint : liste, lecture pour le visualiseur, envoi et lancement d’une impression.
export function createOctoPrintFiles(fetcher = fetch) {
  const call = (machine, path, options = {}) => {
    if (moonrakerOrigin(machine.origin) !== machine.origin || !/^[!-~]{1,256}$/.test(machine.apiKey ?? '')) throw new Error('invalid machine');
    return fetcher(machine.origin + path, { redirect: 'error', ...options, headers: { 'X-Api-Key': machine.apiKey, ...options.headers } });
  };
  const flatten = (entries, out = []) => {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry?.type === 'folder') flatten(entry.children, out);
      else if (entry?.type === 'machinecode' && filePath(entry.path)) {
        out.push({ path: entry.path, size: Number.isFinite(entry.size) ? entry.size : null, modified: Number.isFinite(entry.date) ? entry.date * 1000 : null });
      }
    }
    return out;
  };
  return {
    async list(machine) {
      const response = await call(machine, '/api/files/local?recursive=true', { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (!response.ok) { await response.body?.cancel(); throw new Error('list ' + response.status); }
      return flatten((await readResponse(response))?.files);
    },
    download: (machine, path, signal) => call(machine, '/downloads/files/local/' + encodePath(path), { method: 'GET', signal }),
    async upload(machine, name, source, size) {
      const form = multipart('file', name, source, size);
      const response = await call(machine, '/api/files/local', { method: 'POST', body: form.body, duplex: 'half', headers: form.headers });
      if (!response.ok) { await response.body?.cancel(); return null; }
      const path = (await readResponse(response))?.files?.local?.path;
      return filePath(path) ?? name;
    },
    async start(machine, path) {
      const response = await call(machine, '/api/files/local/' + encodePath(path), {
        method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'select', print: true })
      });
      await response.body?.cancel();
      if (response.status >= 500) throw new Error('start outcome unknown');
      return response.ok;
    }
  };
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
