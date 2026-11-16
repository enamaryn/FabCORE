import { createHash } from 'node:crypto';
import { connect } from 'mqtt';
import { readResponse } from './moonraker.mjs';

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
