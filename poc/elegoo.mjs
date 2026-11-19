import { reportedControls } from './manual-controls.mjs';
import { createHash } from 'node:crypto';
import { connect } from 'mqtt';
import { canvasFilaments } from './filaments.mjs';
import { readResponse } from './connector-http.mjs';

const states = new Map([[0, 'connecting'], [1, 'ready'], [2, 'printing'], [3, 'ready'], [4, 'ready'], [5, 'connecting'], [6, 'error']]);
const printStates = new Map([[2501, 'paused'], [2502, 'paused'], [2505, 'paused'], [2504, 'ready'], [2077, 'done']]);
const empty = (status, issue) => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });
const temperature = (value) => Number.isFinite(value) ? Math.round(value * 10) / 10 : null;

function normalize(result) {
  const machine = result?.machine_status;
  const status = (machine?.status === 2 && printStates.get(machine.sub_status)) || states.get(machine?.status);
  if (!status) return empty('error', 'elegoo-report');
  return {
    status, issue: status === 'error' ? 'elegoo-print' : null,
    nozzle: temperature(result.extruder?.temperature), bed: temperature(result.heater_bed?.temperature),
    progress: status === 'done' ? 100 : Number.isFinite(machine.progress)
      ? Math.round(Math.max(0, Math.min(100, machine.progress))) : 0,
    file: typeof result.print_status?.filename === 'string' ? result.print_status.filename.slice(0, 200) : ''
  };
}

const activeReads = new Map();

export function elegooClientId(serial) {
  const fingerprint = createHash('sha256').update('FabCore CC2:' + serial).digest();
  return '1_PC_' + (100000000 + fingerprint.readUInt32BE() % 900000000);
}

function requestStatus(machine, serial, connectPrinter, signal) {
  return new Promise((resolve) => {
    const clientId = elegooClientId(serial);
    const requestId = `${clientId}_req`;
    const base = `elegoo/${serial}`;
    const registration = `${base}/${requestId}/register_response`;
    const response = `${base}/${clientId}/api_response`;
    const client = connectPrinter(machine.origin, {
      clientId, username: 'elegoo', password: machine.accessCode,
      protocolVersion: 4, connectTimeout: 3000, reconnectPeriod: 0
    });
    let registered = false;
    let settled = false;
    const disconnected = () => finish(empty('offline', 'elegoo-connection'));
    const timer = setTimeout(() => finish(empty('error', 'elegoo-report')), 5000);
    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', disconnected);
      client.end(true);
      resolve(result);
    }
    client.on('error', (error) => {
      if ([4, 5].includes(Number(error.code))) finish(empty('error', 'elegoo-access'));
      else disconnected();
    });
    client.on('close', disconnected);
    client.on('connect', () => {
      client.subscribe([registration, response], (error, grants) => {
        if (settled) return;
        if (error || grants?.length !== 2 || grants.some((grant) => grant.qos >= 128)) {
          finish(empty('error', 'elegoo-access'));
          return;
        }
        client.publish(`${base}/api_register`, JSON.stringify({ client_id: clientId, request_id: requestId }));
      });
    });
    client.on('message', (topic, payload, packet) => {
      if (settled || packet?.retain || payload.length > 65536) return;
      let data;
      try { data = JSON.parse(payload); } catch { return; }
      if (topic === registration && !registered) {
        if (data?.error !== 'ok') return finish(empty('error', 'elegoo-register'));
        registered = true;
        client.publish(`${base}/${clientId}/api_request`, JSON.stringify({ id: 1, method: 1002, params: {} }));
      } else if (topic === response && registered && data?.id === 1 && (data.method === undefined || data.method === 1002)) {
        finish(normalize(data.result));
      }
    });
    if (signal?.aborted) disconnected();
    else signal?.addEventListener('abort', disconnected, { once: true });
  });
}

export async function identifyElegoo(machine, { fetcher = fetch, signal } = {}) {
  const url = new URL('/system/info', `http://${new URL(machine.origin).hostname}`);
  url.searchParams.set('X-Token', machine.accessCode);
  try {
    const timeout = AbortSignal.timeout(2500);
    const info = await fetcher(url, { redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!info.ok) {
      await info.body?.cancel();
      return empty('error', [401, 403].includes(info.status) ? 'elegoo-access' : 'elegoo-info');
    }
    const serial = (await readResponse(info))?.system_info?.sn;
    if (typeof serial !== 'string' || !/^[a-zA-Z0-9_-]{6,64}$/.test(serial)) return empty('error', 'elegoo-info');
    if (machine.serial && machine.serial !== serial) return empty('error', 'elegoo-identity');
    return { serial };
  } catch (error) {
    return error instanceof SyntaxError ? empty('error', 'elegoo-info') : empty('offline', 'elegoo-connection');
  }
}


export async function readElegoo(machine, { fetcher = fetch, connectPrinter = connect, signal } = {}) {
  const identity = await identifyElegoo(machine, { fetcher, signal });
  if (!identity.serial) return identity;
  const { serial } = identity;
  if (signal?.aborted) return empty('offline', 'elegoo-connection');
  const key = JSON.stringify([machine.origin, serial, machine.accessCode]);
  let pending = activeReads.get(key);
  if (!pending) {
    // The transport has its own timeout. One caller cancelling must not affect another caller.
    pending = requestStatus(machine, serial, connectPrinter).finally(() => activeReads.delete(key));
    activeReads.set(key, pending);
  }
  return { ...await pending, serial };
}

// The printer keeps registrations after a TCP disconnect. Keep one client per
// configured machine and use the same identifier when reconnecting.
export function createElegooMonitor({ fetcher = fetch, connectPrinter = connect, now = Date.now, diagnostics } = {}) {
  const sessions = new Map();
  function forget(id) {
    const entry = sessions.get(id);
    sessions.delete(id);
    entry?.close?.();
  }
  function open(machine, entry) {
    const clientId = elegooClientId(machine.serial);
    const requestId = clientId + '_req';
    const root = 'elegoo/' + machine.serial;
    const registration = root + '/' + requestId + '/register_response';
    const response = root + '/' + clientId + '/api_response';
    const status = root + '/api_status';
    const request = root + '/' + clientId + '/api_request';
    diagnostics?.record('mqtt', 'connecting-mqtt', machine.id);
    const client = connectPrinter(machine.origin, { clientId, username: 'elegoo', password: machine.accessCode,
      protocolVersion: 4, connectTimeout: 3000, reconnectPeriod: 0, queueQoSZero: false, keepalive: 30 });
    let registered = false;
    const pending = new Map();
    let transaction = 100;
    let lastReport = 0;
    let lastRequest = 0;
    let lastPing = 0;
    let latest = {};
    let nextCanvas = 0;
    let canvasAt = null;
    const watchdog = setTimeout(() => fail('error', 'elegoo-report'), 8000);
    watchdog.unref();
    const tick = setInterval(() => {
      if (!registered) return;
      const current = now();
      if (lastRequest > lastReport && current - lastRequest >= 7000) {
        fail('offline', 'elegoo-connection');
        return;
      }
      if (current - lastPing >= 30000 && current - lastRequest >= 2500) {
        lastPing = current;
        client.publish(request, JSON.stringify({ type: 'PING' }));
        return;
      }
      if (current - lastReport >= 15000 && current - Math.max(lastRequest, lastPing) >= 2500) {
        query();
        return;
      }
      if (canvasAt !== null && current - canvasAt >= 150000) {
        delete entry.current.filaments;
        canvasAt = null;
      }
      if (lastReport && current >= nextCanvas && current - Math.max(lastRequest, lastPing) >= 2500) {
        nextCanvas = current + 60000;
        client.publish(request, JSON.stringify({ id: 2, method: 2005, params: {} }));
      }
    }, 1000);
    tick.unref();
    entry.close = () => {
      clearInterval(tick);
      clearTimeout(watchdog);
      entry.close = null;
      entry.rpc = null;
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('command-unconfirmed')); }
      pending.clear();
      client.end(true);
    };
    function fail(result, issue) {
      if (!entry.close) return;
      entry.current = empty(result, issue);
      diagnostics?.record('mqtt', issue, machine.id);
      entry.retry = now() + (issue === 'elegoo-register' ? 60000 : 15000);
      entry.close();
    }
    function query() {
      lastRequest = now();
      client.publish(request, JSON.stringify({ id: 1, method: 1002, params: {} }));
    }
    client.on('error', (error) => {
      if ([4, 5].includes(Number(error.code))) fail('error', 'elegoo-access');
      else fail('offline', 'elegoo-connection');
    });
    client.on('close', () => fail('offline', 'elegoo-connection'));
    client.on('connect', () => {
      client.subscribe([registration, response, status], (error, grants) => {
        if (!entry.close) return;
        if (error || grants?.length !== 3 || grants.some((grant) => grant.qos >= 128)) return fail('error', 'elegoo-access');
        client.publish(root + '/api_register', JSON.stringify({ client_id: clientId, request_id: requestId }));
      });
    });
    client.on('message', (topic, payload, packet) => {
      if (!entry.close || packet?.retain || payload.length > 65536) return;
      let message;
      try { message = JSON.parse(payload); } catch { return; }
      if (topic === registration && !registered) {
        if (message?.error !== 'ok') return fail('error', 'elegoo-register');
        registered = true;
        entry.rpc = (method, params) => new Promise((resolve, reject) => {
          if (!entry.close || !client.connected) return reject(new Error('elegoo-connection'));
          const id = ++transaction;
          const timer = setTimeout(() => { pending.delete(id); reject(new Error('command-unconfirmed')); }, 6000);
          pending.set(id, { method, resolve, reject, timer });
          client.publish(request, JSON.stringify({ id, method, params }), { qos: 0, retain: false }, error => {
            if (error && pending.has(id)) { clearTimeout(timer); pending.delete(id); reject(error); }
          });
        });
        diagnostics?.record('mqtt', 'registered', machine.id);
        lastPing = now();
        query();
        return;
      }
      if (!registered) return;
      const item = topic === response && pending.get(message.id);
      if (item && (message.method === undefined || message.method === item.method)) {
        pending.delete(message.id); clearTimeout(item.timer);
        if (Number.isInteger(message.result?.error_code)) item.resolve(message.result.error_code === 0);
        else item.reject(new Error('command-unconfirmed'));
        return;
      }
      if (!message?.result || typeof message.result !== 'object') return;
      if (topic === response && message.id === 2 && (message.method === undefined || message.method === 2005)) {
        const filaments = canvasFilaments(message.result);
        if (filaments !== null) {
          canvasAt = now();
          entry.current = { ...entry.current, filaments };
        }
        return;
      }
      const push = (topic === response || topic === status) && [6000, 6008].includes(message.method);
      const reply = topic === response && message.id === 1 && (message.method === undefined || message.method === 1002);
      if (!push && !reply) return;
      for (const field of ['machine_status', 'extruder', 'heater_bed', 'print_status']) {
        if (message.result[field] && typeof message.result[field] === 'object') {
          latest[field] = { ...latest[field], ...message.result[field] };
        }
      }
      const report = normalize(latest);
      entry.controls = reportedControls('elegoo', latest);
      if (report.issue === 'elegoo-report') return;
      clearTimeout(watchdog);
      lastReport = now();
      diagnostics?.report(machine.id);
      entry.current = { ...entry.current, ...report, serial: machine.serial };
    });
  }
  return {
    controlState(machine) { return sessions.get(machine.id)?.controls; },
    request(machine, method, params = {}) {
      const entry = sessions.get(machine.id);
      if (!entry?.rpc) throw new Error('elegoo-connection');
      return entry.rpc(method, params);
    },
    command(machine, action) {
      const method = { pause: 1021, stop: 1022 }[action];
      if (!method) return false;
      const entry = sessions.get(machine.id);
      if (!entry?.rpc) throw new Error('elegoo-connection');
      return entry.rpc(method, {});
    },
    async read(machine) {
      let entry = sessions.get(machine.id);
      if (!entry) {
        entry = { current: empty('connecting', null), retry: 0 };
        sessions.set(machine.id, entry);
      }
      if (!entry.close && !entry.pending && now() >= entry.retry) {
        entry.pending = (async () => {
          const identity = await identifyElegoo(machine, { fetcher });
          if (sessions.get(machine.id) !== entry) return;
          if (identity.serial) open(machine, entry);
          else { entry.current = identity; entry.retry = now() + 15000; }
        })().catch(() => {
          entry.current = empty('offline', 'elegoo-connection');
          entry.retry = now() + 15000;
        }).finally(() => { entry.pending = null; });
      }
      return entry.current;
    },
    forget,
    close() { for (const id of sessions.keys()) forget(id); }
  };
}
