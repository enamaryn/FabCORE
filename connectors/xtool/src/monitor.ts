import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { XToolConnection, XToolMachine, XToolPorts, XToolReadOptions, XToolReadResult, XToolSession, XToolSnapshot, XToolStatus, XToolUpgrade } from './types.ts';

const maxFrame = 65536;
const states = new Map<string, XToolStatus>([
  ['Initial', 'connecting'], ['Idle', 'ready'], ['Sleep', 'ready'], ['WorkReady', 'ready'],
  ['WorkPlay', 'printing'], ['WorkPause', 'paused'], ['WorkCancel', 'printing'], ['WorkDone', 'done'],
  ['finish', 'done'], ['Error', 'error'], ['P_IDLE', 'ready'], ['P_PROCESSING', 'printing'],
  ['P_PAUSE', 'paused'], ['P_FINISH', 'done'], ['P_ERROR', 'error'],
  ['P_FRAMING', 'printing'], ['P_FRAME_READY', 'ready'], ['P_PROCESSING_READY', 'ready'],
  ['P_FINISH_PROCESSING', 'done'], ['P_SLEEP', 'ready'], ['P_INITIALIZING', 'connecting'],
  ['P_EMERGENCY_STOP', 'error']
]);

function crc16(bytes: Uint8Array) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xA001 : 0);
  }
  return crc;
}

function encode(value: unknown) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(10);
  header.writeUInt16BE(0xBABE);
  header.writeUIntBE(body.length, 2, 3);
  header[5] = 4;
  header.writeUInt16BE(crc16(body), 6);
  header.writeUInt16BE(crc16(header.subarray(0, 8)), 8);
  return Buffer.concat([header, body]);
}

const result = (status: XToolStatus, issue: string | null = null): XToolSnapshot => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
interface StateReport { mode?: string; curMode?: { mode?: string } }
interface WireMessage {
  type?: string;
  method?: string;
  code?: number;
  transactionId?: number;
  data?: {
    transactionId?: number;
    sessionToken?: unknown;
    token?: unknown;
    authState?: string;
    sn?: unknown;
    snCode?: unknown;
    curMode?: { mode?: string };
    '/v1/platform/device/state'?: StateReport;
  };
}
interface MonitorEntry {
  controller: AbortController;
  current: XToolReadResult;
  retryAt: number;
  session?: XToolSession | null;
}

/** Protocole M2 canonique ; helpers et caméras fournis par l'adaptateur de composition. */
export function createXToolServices({ privateIPv4, Socket: DefaultSocket, snapshotXToolCamera, streamXToolCamera }: XToolPorts) {
  function readXTool(machine: XToolConnection, { signal, identityOnly = false, pairing = false, onStatus, onReady, Socket = DefaultSocket }: XToolReadOptions = {}): Promise<XToolReadResult> {
    const url = new URL(machine.origin);
    if (url.protocol !== 'wss:' || !privateIPv4(url.hostname) || url.port !== '28900' || signal?.aborted) {
      return Promise.resolve(result('offline', 'xtool-connection'));
    }
    url.pathname = '/websocket';
    url.search = new URLSearchParams({ id: randomUUID(), function: 'instruction' }).toString();

    return new Promise<XToolReadResult>((resolve) => {
      const ws = new Socket(url, { rejectUnauthorized: false, followRedirects: false,
        origin: 'atomm://renderer', handshakeTimeout: 4000, maxPayload: maxFrame });
      let buffer = Buffer.alloc(0);
      let finished = false;
      let serial: string | undefined;
      let fingerprint: string | undefined;
      let transaction = 0;
      let step = 0;
      let poll: ReturnType<typeof setTimeout> | undefined;
      let awaitingConfirmation = false;
      let sessionToken: string | undefined;
      let pairingToken: string | undefined;
      let reportedState: XToolStatus | undefined;
      let syncAcknowledged = false;
      const pending = new Map<number, PendingRequest>();
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let heartbeatAt = Date.now();
      const requests: [string, string, Record<string, unknown>][] = [
        ['GET', '/v1/user/parity', { userID: 'mk-guest', userKey: 'bWFrZWJsb2NrLXh0b29s', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(pairing || machine.pairingToken ? { token: pairing ? '' : machine.pairingToken } : {}) }],
        ['GET', '/v1/platform/device/machine-info', {}],
        ['POST', '/v1/platform/device/state/sync', {}]
      ];
      const disconnect = () => finish(result('offline', 'xtool-connection'));
      const timer = setTimeout(() => finish(result('error', awaitingConfirmation ? 'xtool-pairing-timeout' : 'xtool-protocol')),
        pairing ? 45_000 : 12_000);
      function finish(state: XToolReadResult) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearTimeout(poll);
        clearInterval(heartbeat);
        signal?.removeEventListener('abort', disconnect);
        ws.terminate();
        for (const request of pending.values()) {
          clearTimeout(request.timer);
          request.reject(new Error('xtool-connection'));
        }
        pending.clear();
        onStatus?.(state);
        resolve(state);
      }
      function send(method: string, path: string, data: Record<string, unknown> = {}) {
        ws.send(encode({ type: 'request', method, url: path, params: {}, data, timestamp: Date.now(),
          transactionId: ++transaction, ...(sessionToken ? { sessionToken } : {}) }));
        return transaction;
      }
      function sendNext() {
        send(...requests[step++]!);
      }
      function waitForConfirmation() {
        awaitingConfirmation = true;
        clearTimeout(poll);
        poll = setTimeout(() => send('GET', '/v1/user/auth-status'), 1000);
      }
      ws.on('error', disconnect);
      ws.on('close', disconnect);
      ws.on('upgrade', (response: XToolUpgrade) => {
        fingerprint = response.socket.getPeerCertificate()?.fingerprint256;
        if (!fingerprint || (machine.fingerprint && machine.fingerprint !== fingerprint)) {
          finish(result('error', 'xtool-identity'));
        }
      });
      ws.on('open', () => { if (!finished) sendNext(); });
      function completeStatus() {
        if (!serial || !syncAcknowledged || !reportedState) return;
        const state = { ...result(reportedState, reportedState === 'error' ? 'xtool-device' : null),
          serial, fingerprint, ...(pairingToken ? { pairingToken } : {}) };
        if (!onStatus) return finish(state);
        clearTimeout(timer);
        onStatus(state);
        resolve(state);
        if (!heartbeat) {
          onReady?.({
            url, fingerprint, Socket,
            request<T = unknown>(method: string, path: string, data: Record<string, unknown> = {}, params: Record<string, unknown> = {}) {
              return new Promise<T>((resolve, reject) => {
                const id = ++transaction;
                const timer = setTimeout(() => { pending.delete(id); reject(new Error('xtool-protocol')); }, 10_000);
                pending.set(id, { resolve: value => resolve(value as T), reject, timer });
                ws.send(encode({ type: 'request', method, url: path, params, data,
                  timestamp: Date.now(), transactionId: id, ...(sessionToken ? { sessionToken } : {}) }));
              });
            }
          });
          heartbeat = setInterval(() => {
            if (Date.now() - heartbeatAt > 35_000) return disconnect();
            ws.send(encode({ type: 'request', method: 'GET', url: '/v1/user/ping',
              params: {}, data: {}, timestamp: Date.now(), transactionId: 65510,
              ...(sessionToken ? { sessionToken } : {}) }));
          }, 10_000);
          heartbeat.unref();
        }
      }
      function handleResponse(payload: Buffer) {
        let message: WireMessage;
        try { message = JSON.parse(payload.toString()) as WireMessage; } catch { return finish(result('error', 'xtool-protocol')); }
        const request = message?.type === 'response' && pending.get(message.transactionId!);
        if (request) {
          pending.delete(message.transactionId!);
          clearTimeout(request.timer);
          if (message.code === 0) request.resolve(message.data);
          else request.reject(Object.assign(new Error('xtool-request'), { deviceCode: message.code }));
          return;
        }
        if (message?.type === 'response' && message.transactionId === 65510) {
          if (message.code === 0) heartbeatAt = Date.now();
          return;
        }
        const push = message?.data?.['/v1/platform/device/state'];
        if (message?.type === 'request' || message?.method === 'REPORT') {
          const state = states.get(push?.mode ?? push?.curMode?.mode ?? '');
          if (state) {
            reportedState = state;
            completeStatus();
          }
          return;
        }
        if (message?.type !== 'response' || (message.transactionId ?? message.data?.transactionId) !== transaction) return;
        if (step === 1 && message.code === 406) {
          if (pairing && (message.data?.authState === 'WAITING_BUTTON_CONFIRM' ||
              (awaitingConfirmation && !message.data?.authState))) return waitForConfirmation();
          return finish(identityOnly ? { candidate: true } : result('error', 'xtool-authorization'));
        }
        if (awaitingConfirmation && message.code === 410) return finish(result('error', 'xtool-pairing-timeout'));
        if (pairing && step === 1 && [409, 503].includes(message.code!)) return finish(result('error', 'xtool-pairing-busy'));
        if (message.code != null && message.code !== 0) return finish(result('error', 'xtool-protocol'));
        if (step === 1) {
          if (typeof message.data?.sessionToken === 'string') sessionToken = message.data.sessionToken;
          if (pairing && typeof message.data?.token === 'string' && message.data.token) pairingToken = message.data.token;
          if (awaitingConfirmation && !pairingToken) return finish(result('error', 'xtool-authorization'));
          awaitingConfirmation = false;
        }
        if (step === 2) {
          const reportedSerial = message.data?.sn || message.data?.snCode;
          if (typeof reportedSerial !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(reportedSerial) || (machine.serial && machine.serial !== reportedSerial)) {
            return finish(result('error', 'xtool-identity'));
          }
          serial = reportedSerial;
          if (identityOnly) return finish({ serial, fingerprint });
        }
        if (step < 3) sendNext();
        else {
          syncAcknowledged = true;
          const state = states.get(message.data?.curMode?.mode ?? '');
          if (state) reportedState = state;
          completeStatus();
        }
      }
      ws.on('message', (data: Buffer, binary: boolean) => {
        if (finished) return;
        if (!binary) return handleResponse(data);
        if (buffer.length + data.length > maxFrame) return finish(result('error', 'xtool-protocol'));
        buffer = Buffer.concat([buffer, data]);
        while (buffer.length >= 10 && !finished) {
          const length = buffer.readUIntBE(2, 3);
          if (buffer.readUInt16BE(0) !== 0xBABE || length > maxFrame - 10 ||
              buffer.readUInt16BE(8) !== crc16(buffer.subarray(0, 8))) return finish(result('error', 'xtool-protocol'));
          if (buffer.length < 10 + length) return;
          const frame = buffer.subarray(0, 10 + length);
          buffer = buffer.subarray(10 + length);
          if ((frame[5]! & 0x7F) !== 4) continue;
          const body = frame.subarray(10);
          if (!(frame[5]! & 0x80) && frame.readUInt16BE(6) !== crc16(body)) return finish(result('error', 'xtool-protocol'));
          handleResponse(body);
        }
      });
      if (signal?.aborted) disconnect();
      else signal?.addEventListener('abort', disconnect, { once: true });
    });
  }

  function createXToolMonitor({ Socket = DefaultSocket }: Pick<XToolReadOptions, 'Socket'> = {}) {
    const sessions = new Map<string, MonitorEntry>();
    // Après close(), plus aucune session n'est ouverte : un appel tardif ne doit pas recréer de connexion.
    let closed = false;
    function forget(id: string) {
      const entry = sessions.get(id);
      sessions.delete(id);
      entry?.controller.abort();
    }
    function read(machine: XToolMachine): XToolReadResult {
      if (closed) return result('offline', 'xtool-connection');
      let entry = sessions.get(machine.id);
      if (!entry) {
        entry = { controller: new AbortController(), current: result('connecting'), retryAt: 0 };
        sessions.set(machine.id, entry);
        const activeEntry = entry;
        const update = (state: XToolReadResult) => {
          activeEntry.current = { ...state, checkedAt: new Date().toISOString() };
          if ('issue' in state && state.issue && ['offline', 'error'].includes(state.status)) {
            activeEntry.session = null;
            activeEntry.retryAt = Date.now() + 30_000;
          }
        };
        void readXTool(machine, { Socket, signal: entry.controller.signal, onStatus: update, onReady: session => { activeEntry.session = session; } });
      } else if (entry.retryAt && entry.retryAt <= Date.now()) {
        forget(machine.id);
        return read(machine);
      }
      return entry.current;
    }
    return {
      read,
      async command(machine: XToolMachine, action: string) {
        const verb = ({ start: 'START', pause: 'PAUSE', resume: 'RESUME', stop: 'CANCEL' } as Record<string, string>)[action];
        const session = sessions.get(machine.id)?.session;
        if (!verb || !session) return false;
        // M2/JS002: processing/state only stops framing, not a real job.
        try {
          await session.request('POST', '/v1/project/device/control', {}, { action: verb });
          return true;
        } catch (error) {
          if (Number.isFinite((error as { deviceCode?: unknown }).deviceCode)) return false;
          throw error;
        }
      },
      async preview(machine: XToolMachine, signal: AbortSignal, view?: string) {
        read(machine);
        return snapshotXToolCamera(() => sessions.get(machine.id)?.session, signal, view);
      },
      async camera(machine: XToolMachine, output: ServerResponse, signal: AbortSignal, onFrame: () => void, view?: string) {
        read(machine);
        return streamXToolCamera(() => sessions.get(machine.id)?.session, output, signal, onFrame, view);
      },
      forget,
      close() {
        closed = true;
        for (const id of sessions.keys()) forget(id);
      }
    };
  }

  return { readXTool, createXToolMonitor };
}
