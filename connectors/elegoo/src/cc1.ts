import { randomBytes } from 'node:crypto';
import { createSocket } from 'node:dgram';
import type { CC2Snapshot, CC2Status } from './types.ts';

export interface CC1Connection { origin: string; serial?: string | undefined }
type SocketConstructor = new (url: string) => Pick<WebSocket, 'send' | 'close' | 'addEventListener'>;
interface CC1Options { Socket?: SocketConstructor; signal?: AbortSignal; discoverPrinter?: (host: string, signal?: AbortSignal) => string | null | Promise<string | null> }
interface CC1Report { PrintInfo?: { Status?: number; Progress?: number; Filename?: unknown }; TempOfNozzle?: unknown; TempOfHotbed?: unknown }
interface CC1Message { Topic?: string; Status?: CC1Report; Data?: CC1Report & { Cmd?: number; RequestID?: string; Data?: { Ack?: number }; Status?: CC1Report } }

const states = new Map<number | undefined, CC2Status>([
  [0, 'ready'], [1, 'connecting'], [5, 'paused'], [6, 'paused'],
  [7, 'printing'], [8, 'ready'], [9, 'done'], [10, 'connecting'], [11, 'connecting'],
  [12, 'printing'], [13, 'printing'], [14, 'error'], [15, 'connecting'],
  [16, 'printing'], [17, 'connecting'], [18, 'printing'], [19, 'ready']
]);
const empty = (status: CC2Status, issue: string): CC2Snapshot => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });
const serialPattern = /^[a-zA-Z0-9_-]{6,64}$/;

export function requestElegooCC1(machine: CC1Connection, command: number, params: Record<string, unknown> = {}, { Socket = WebSocket }: CC1Options = {}): Promise<boolean> {
  if (!serialPattern.test(machine.serial ?? '')) return Promise.resolve(false);
  return new Promise<boolean>((resolve, reject) => {
    const requestId = randomBytes(8).toString('hex');
    const ws = new Socket(machine.origin + '/websocket');
    let done = false;
    const timer = setTimeout(() => finish(new Error('command-unconfirmed')), 6000);
    function finish(error: Error | null, accepted = false) {
      if (done) return;
      done = true; clearTimeout(timer); ws.close();
      if (error) reject(error); else resolve(accepted);
    }
    ws.addEventListener('open', () => ws.send(JSON.stringify({ Id: machine.serial, Topic: `sdcp/request/${machine.serial}`,
      Data: { Cmd: command, Data: params, RequestID: requestId, MainboardID: machine.serial, TimeStamp: Date.now(), From: 1 } })));
    ws.addEventListener('error', () => finish(new Error('command-unconfirmed')));
    ws.addEventListener('close', () => finish(new Error('command-unconfirmed')));
    ws.addEventListener('message', event => {
      if (done || typeof event.data !== 'string' || event.data.length > 65536) return;
      let message: CC1Message;
      try { message = JSON.parse(event.data) as CC1Message; } catch { return; }
      const data = message.Data;
      if (message.Topic !== `sdcp/response/${machine.serial}` || data?.RequestID !== requestId || data.Cmd !== command) return;
      if (Number.isInteger(data.Data?.Ack)) finish(null, data!.Data!.Ack === 0);
      else finish(new Error('command-unconfirmed'));
    });
  });
}

export function commandElegooCC1(machine: CC1Connection, action: string, options?: CC1Options) {
  const command = ({ pause: 129, stop: 130, resume: 131 } as Record<string, number>)[action];
  return command ? requestElegooCC1(machine, command, {}, options) : false;
}

function discover(host: string, signal?: AbortSignal): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const socket = createSocket('udp4');
    let finished = false;
    const timer = setTimeout(() => finish(null), 2000);
    const abort = () => finish(null);
    function finish(serial: string | null) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      socket.close();
      resolve(serial);
    }
    socket.on('error', abort);
    socket.on('message', (payload, peer) => {
      if (peer.address !== host || payload.length > 8192) return;
      let message: { Data?: { MainboardID?: unknown }; MainboardID?: unknown };
      try { message = JSON.parse(payload.toString()); } catch { return; }
      const serial = message?.Data?.MainboardID ?? message?.MainboardID;
      if (typeof serial === 'string' && serialPattern.test(serial)) finish(serial);
    });
    socket.bind(0, () => {
      if (finished) return;
      socket.setBroadcast(true);
      socket.send('M99999', 3000, '255.255.255.255', (error) => { if (error) abort(); });
    });
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

const temperature = (value: unknown) => {
  const actual = Array.isArray(value) ? value[1] : value;
  return Number.isFinite(actual) ? Math.round((actual as number) * 10) / 10 : null;
};

export async function readElegooCC1(machine: CC1Connection, { discoverPrinter = discover, Socket = WebSocket, signal }: CC1Options = {}): Promise<CC2Snapshot> {
  const serial = machine.serial ?? await discoverPrinter(new URL(machine.origin).hostname, signal);
  if (!serialPattern.test(serial ?? '')) return empty('offline', 'cc1-discovery');
  return new Promise<CC2Snapshot>((resolve) => {
    const ws = new Socket(machine.origin + '/websocket');
    let finished = false;
    const timer = setTimeout(() => finish(empty('error', 'cc1-report')), 4000);
    const disconnect = () => finish(empty('offline', 'cc1-connection'));
    function finish(result: CC2Snapshot) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', disconnect);
      ws.close();
      resolve({ ...result, serial: serial! });
    }
    ws.addEventListener('open', () => {
      if (finished) return;
      ws.send(JSON.stringify({
        Id: serial, Topic: `sdcp/request/${serial}`,
        Data: { Cmd: 0, Data: {}, RequestID: randomBytes(8).toString('hex'), MainboardID: serial, TimeStamp: Date.now(), From: 1 }
      }));
    });
    ws.addEventListener('error', disconnect);
    ws.addEventListener('close', disconnect);
    ws.addEventListener('message', (event) => {
      if (finished || typeof event.data !== 'string' || event.data.length > 65536) return;
      let message: CC1Message;
      try { message = JSON.parse(event.data) as CC1Message; } catch { return; }
      if (message?.Topic !== `sdcp/status/${serial}`) return;
      const data = message.Status ?? message.Data?.Status ?? message.Data;
      const print = data?.PrintInfo;
      const status = states.get(print?.Status);
      if (!status) return;
      finish({
        status, issue: status === 'error' ? 'elegoo-print' : null,
        nozzle: temperature(data!.TempOfNozzle), bed: temperature(data!.TempOfHotbed),
        progress: status === 'done' ? 100 : Number.isFinite(print!.Progress!)
          ? Math.round(Math.max(0, Math.min(100, print!.Progress!))) : 0,
        file: typeof print!.Filename === 'string' ? print!.Filename.slice(0, 200) : ''
      });
    });
    if (signal?.aborted) disconnect();
    else signal?.addEventListener('abort', disconnect, { once: true });
  });
}
