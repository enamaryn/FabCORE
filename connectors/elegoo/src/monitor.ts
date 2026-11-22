import { createHash } from 'node:crypto';
import { connect } from 'mqtt';
import type { CC2Connection, CC2Machine, CC2Snapshot, CC2Identity, CC2Status, CC2Report, CC2Result, CC2Message, CC2Connect, CC2Options, CC2MonitorOptions, CC2Ports } from './types.ts';

interface PendingRPC {
  method: number;
  raw: boolean;
  resolve(value: boolean | CC2Result): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
interface Session {
  current: CC2Identity | CC2Snapshot;
  retry: number;
  controlAt: number;
  controls?: unknown;
  close?: (() => void) | null;
  rpc?: ((method: number, params: Record<string, unknown>, raw?: boolean) => Promise<boolean | CC2Result>) | null;
  pending?: Promise<void> | null;
}

/** Une seule implémentation CC2. Les projections encore partagées sont injectées par le POC. */
export function createCC2Services({ reportedControls, canvasFilaments, readResponse }: CC2Ports) {
  const states = new Map<number | undefined, CC2Status>([[0, 'connecting'], [1, 'ready'], [2, 'printing'], [3, 'ready'], [4, 'ready'], [5, 'connecting'], [6, 'error']]);
  const printStates = new Map<number | undefined, CC2Status>([[2501, 'paused'], [2502, 'paused'], [2505, 'paused'], [2504, 'ready'], [2077, 'done']]);
  const empty = (status: CC2Status, issue: string | null): CC2Snapshot => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });
  const finite = (value: unknown): value is number => Number.isFinite(value);
  const temperature = (value: unknown) => finite(value) ? Math.round(value * 10) / 10 : null;

  function normalize(result: CC2Report | undefined): CC2Snapshot {
    const machine = result?.machine_status;
    const status = (machine?.status === 2 && printStates.get(machine.sub_status)) || states.get(machine?.status);
    if (!status) return empty('error', 'elegoo-report');
    return {
      status, issue: status === 'error' ? 'elegoo-print' : null,
      nozzle: temperature(result?.extruder?.temperature), bed: temperature(result?.heater_bed?.temperature),
      progress: status === 'done' ? 100 : finite(machine?.progress)
        ? Math.round(Math.max(0, Math.min(100, machine.progress))) : 0,
      file: typeof result?.print_status?.filename === 'string' ? result.print_status.filename.slice(0, 200) : ''
    };
  }

  const activeReads = new Map<string, Promise<CC2Snapshot>>();

  function elegooClientId(serial: string) {
    const fingerprint = createHash('sha256').update('FabCore CC2:' + serial).digest();
    return '1_PC_' + (100000000 + fingerprint.readUInt32BE() % 900000000);
  }

  function requestStatus(machine: CC2Connection, serial: string, connectPrinter: CC2Connect, signal?: AbortSignal) {
    return new Promise<CC2Snapshot>((resolve) => {
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
      function finish(result: CC2Snapshot) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', disconnected);
        client.end(true);
        resolve(result);
      }
      client.on('error', (error) => {
        if ([4, 5].includes(Number((error as Error & { code?: unknown }).code))) finish(empty('error', 'elegoo-access'));
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
        try { data = JSON.parse(payload.toString()) as CC2Message; } catch { return; }
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

  async function identifyElegoo(machine: CC2Connection, { fetcher = fetch, signal }: CC2Options = {}): Promise<CC2Identity> {
    const url = new URL('/system/info', `http://${new URL(machine.origin).hostname}`);
    url.searchParams.set('X-Token', machine.accessCode);
    try {
      const timeout = AbortSignal.timeout(2500);
      const info = await fetcher(url, { redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!info.ok) {
        await info.body?.cancel();
        return empty('error', [401, 403].includes(info.status) ? 'elegoo-access' : 'elegoo-info');
      }
      const serial = (await readResponse(info) as { system_info?: { sn?: unknown } } | null)?.system_info?.sn;
      if (typeof serial !== 'string' || !/^[a-zA-Z0-9_-]{6,64}$/.test(serial)) return empty('error', 'elegoo-info');
      if (machine.serial && machine.serial !== serial) return empty('error', 'elegoo-identity');
      return { serial };
    } catch (error) {
      return error instanceof SyntaxError ? empty('error', 'elegoo-info') : empty('offline', 'elegoo-connection');
    }
  }


  async function readElegoo(machine: CC2Connection, { fetcher = fetch, connectPrinter = connect, signal }: CC2Options = {}): Promise<CC2Identity | CC2Snapshot> {
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
  function createElegooMonitor({ fetcher = fetch, connectPrinter = connect, now = Date.now, diagnostics }: CC2MonitorOptions = {}) {
    const sessions = new Map<string, Session>();
    // Après close(), plus aucune session n'est ouverte : un appel tardif ne doit pas recréer de connexion.
    let closed = false;
    function forget(id: string) {
      const entry = sessions.get(id);
      sessions.delete(id);
      entry?.close?.();
    }
    function open(machine: CC2Machine, entry: Session) {
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
      const pending = new Map<number, PendingRPC>();
      let transaction = 100;
      let lastReport = 0;
      let lastRequest = 0;
      let lastPing = 0;
      const latest: CC2Report = {};
      let nextCanvas = 0;
      let canvasAt: number | null = null;
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
          if ('filaments' in entry.current) delete entry.current.filaments;
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
        entry.controls = undefined;
        for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('command-unconfirmed')); }
        pending.clear();
        client.end(true);
      };
      function fail(result: CC2Status, issue: string) {
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
        if ([4, 5].includes(Number((error as Error & { code?: unknown }).code))) fail('error', 'elegoo-access');
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
        if (!entry.close || packet?.retain || payload.length > 512 * 1024) return;
        let message;
        try { message = JSON.parse(payload.toString()) as CC2Message; } catch { return; }
        if (topic === registration && !registered) {
          if (message?.error !== 'ok') return fail('error', 'elegoo-register');
          registered = true;
          entry.rpc = (method: number, params: Record<string, unknown>, raw = false) => new Promise<boolean | CC2Result>((resolve, reject) => {
            if (!entry.close || !client.connected) return reject(new Error('elegoo-connection'));
            const id = ++transaction;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('command-unconfirmed')); }, 6000);
            pending.set(id, { method, raw, resolve, reject, timer });
            diagnostics?.trace?.(machine.id, 'mqtt-send', { topic: request, method, sequence_id: id, params });
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
        const item = topic === response && message.id !== undefined ? pending.get(message.id) : undefined;
        if (item && (message.method === undefined || message.method === item.method)) {
          diagnostics?.trace?.(machine.id, 'mqtt-command-response', { topic, method: item.method, sequence_id: message.id, correlated: true, payload: message.result });
          pending.delete(message.id!); clearTimeout(item.timer);
          if (Number.isInteger(message.result?.error_code)) {
            if (item.raw) {
              if (message.result!.error_code === 0) item.resolve(message.result!);
              else item.reject(new Error('files-unavailable'));
            } else item.resolve(message.result!.error_code === 0);
          }
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
        const push = (topic === response || topic === status) && [6000, 6008].includes(message.method ?? -1);
        const reply = topic === response && message.id === 1 && (message.method === undefined || message.method === 1002);
        if (!push && !reply) return;
        for (const field of ['machine_status', 'extruder', 'heater_bed', 'print_status'] as const) {
          if (message.result[field] && typeof message.result[field] === 'object') {
            latest[field] = { ...latest[field], ...message.result[field] };
          }
        }
        const report = normalize(latest);
        entry.controls = reportedControls('elegoo', latest);
        if (report.issue === 'elegoo-report') return;
        clearTimeout(watchdog);
        lastReport = now();
        entry.controlAt = lastReport;
        diagnostics?.report(machine.id);
        entry.current = { ...entry.current, ...report, serial: machine.serial };
      });
    }
    return {
      queryFiles(machine: CC2Machine) {
        const entry = sessions.get(machine.id);
        if (!entry?.rpc) throw new Error('elegoo-connection');
        return entry.rpc(1044, { storage_media: 'local', path: '/' }, true) as Promise<CC2Result>;
      },
      controlState(machine: CC2Machine) {
        const entry = sessions.get(machine.id);
        if (!entry?.rpc || now() - entry.controlAt > 30000) return undefined;
        return entry.controls;
      },
      request(machine: CC2Machine, method: number, params: Record<string, unknown> = {}) {
        const entry = sessions.get(machine.id);
        if (!entry?.rpc) throw new Error('elegoo-connection');
        return entry.rpc(method, params);
      },
      command(machine: CC2Machine, action: string) {
        const method = ({ pause: 1021, stop: 1022 } as Record<string, number>)[action];
        if (!method) return false;
        const entry = sessions.get(machine.id);
        if (!entry?.rpc) throw new Error('elegoo-connection');
        return entry.rpc(method, {});
      },
      async read(machine: CC2Machine) {
        if (closed) return empty('offline', 'elegoo-connection');
        let entry = sessions.get(machine.id);
        if (!entry) {
          entry = { controlAt: 0, current: empty('connecting', null), retry: 0 };
          sessions.set(machine.id, entry);
        }
        const session = entry;
        if (!session.close && !session.pending && now() >= session.retry) {
          session.pending = (async () => {
            const identity = await identifyElegoo(machine, { fetcher });
            if (sessions.get(machine.id) !== session) return;
            if (identity.serial) open(machine, session);
            else { session.current = identity; session.retry = now() + 15000; }
          })().catch(() => {
            session.current = empty('offline', 'elegoo-connection');
            session.retry = now() + 15000;
          }).finally(() => { session.pending = null; });
        }
        return entry.current;
      },
      forget,
      close() { closed = true; for (const id of sessions.keys()) forget(id); }
    };
  }

  return { elegooClientId, identifyElegoo, readElegoo, createElegooMonitor };
}
