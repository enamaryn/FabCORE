import { moonrakerOrigin, readResponse, encodePath, filePath } from './connector-http.mjs';

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

export function createPrusaOperations(fetcher = fetch) {
  function call(machine, path, options = {}) {
    if (moonrakerOrigin(machine.origin) !== machine.origin || !/^[!-~]{1,256}$/.test(machine.apiKey ?? '')) throw new Error('invalid-machine');
    return fetcher(machine.origin + path, { redirect: 'error', ...options,
      headers: { 'X-Api-Key': machine.apiKey, ...options.headers }, signal: options.signal ?? AbortSignal.timeout(15000) });
  }
  async function json(machine, path) {
    const response = await call(machine, path);
    if (!response.ok) { await response.body?.cancel(); throw new Error('prusalink-response'); }
    return readResponse(response);
  }
  async function accepted(machine, path, options) {
    const response = await call(machine, path, options);
    await response.body?.cancel();
    if (response.status >= 500) throw new Error('command-unconfirmed');
    return response.ok;
  }
  return {
    async command(machine, action) {
      if (!['pause', 'resume', 'stop'].includes(action)) return false;
      const job = await json(machine, '/api/v1/job');
      if (!Number.isSafeInteger(job?.id)) return false;
      return accepted(machine, '/api/v1/job/' + job.id + (action === 'stop' ? '' : '/' + action), { method: action === 'stop' ? 'DELETE' : 'PUT' });
    },
    files: {
      async list(machine) {
        const { storage_list: storage } = await json(machine, '/api/v1/storage');
        if (!Array.isArray(storage)) throw new Error('prusalink-response');
        const out = [];
        let directories = 0;
        async function walk(path, depth = 0) {
          if (depth > 6 || ++directories > 40) return;
          const folder = await json(machine, '/api/v1/files/' + encodePath(path) + '/');
          for (const entry of (folder.children ?? []).slice(0, 300)) {
            if (out.length >= 300) return;
            if (typeof entry.name !== 'string' || entry.name.includes('/') || !filePath(entry.name + '.gcode')) continue;
            const target = path + '/' + entry.name;
            if (entry.type === 'FOLDER') await walk(target, depth + 1);
            else if (filePath(target)) out.push({ path: target, size: entry.size ?? null, modified: Number.isFinite(entry.m_timestamp) ? entry.m_timestamp * 1000 : null });
          }
        }
        for (const entry of storage) if (typeof entry.path === 'string' && /^\/[a-zA-Z0-9_-]+\/?$/.test(entry.path) && entry.available !== false) await walk(entry.path.replace(/^\/|\/$/g, ''));
        return out;
      },
      async download(machine, path, signal) {
        const info = await json(machine, '/api/v1/files/' + encodePath(path));
        const url = new URL(info.refs?.download, machine.origin);
        if (url.origin !== machine.origin || url.username || url.password || !/^\/(usb|local|sdcard)\//.test(url.pathname)) throw new Error('invalid-download');
        return call(machine, url.pathname + url.search, { signal });
      },
      async upload(machine, name, source, size) {
        const storage = (await json(machine, '/api/v1/storage')).storage_list?.find(entry => entry.available !== false && entry.read_only === false && /^\/[a-zA-Z0-9_-]+\/?$/.test(entry.path));
        if (!storage) return null;
        const path = storage.path.replace(/^\/|\/$/g, '') + '/' + name;
        return await accepted(machine, '/api/v1/files/' + encodePath(path), { method: 'PUT', body: source, duplex: 'half',
          headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size), 'Print-After-Upload': '?0', Overwrite: '?0' } }) ? path : null;
      },
      start: (machine, path) => accepted(machine, '/api/v1/files/' + encodePath(path), { method: 'POST' })
    }
  };
}
