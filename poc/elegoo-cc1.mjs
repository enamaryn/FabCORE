import { randomBytes } from 'node:crypto';
import { createSocket } from 'node:dgram';

const states = new Map([
  [0, 'ready'], [1, 'connecting'], [5, 'paused'], [6, 'paused'],
  [7, 'printing'], [8, 'ready'], [9, 'done'], [10, 'connecting'], [11, 'connecting'],
  [12, 'printing'], [13, 'printing'], [14, 'error'], [15, 'connecting'],
  [16, 'printing'], [17, 'connecting'], [18, 'printing'], [19, 'ready']
]);
const empty = (status, issue) => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });
const serialPattern = /^[a-zA-Z0-9_-]{6,64}$/;

function discover(host, signal) {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    let finished = false;
    const timer = setTimeout(() => finish(null), 2000);
    const abort = () => finish(null);
    function finish(serial) {
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
      let message;
      try { message = JSON.parse(payload); } catch { return; }
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

const temperature = (value) => {
  const actual = Array.isArray(value) ? value[1] : value;
  return Number.isFinite(actual) ? Math.round(actual * 10) / 10 : null;
};

export async function readElegooCC1(machine, { discoverPrinter = discover, Socket = WebSocket, signal } = {}) {
  const serial = machine.serial ?? await discoverPrinter(new URL(machine.origin).hostname, signal);
  if (!serialPattern.test(serial ?? '')) return empty('offline', 'cc1-discovery');
  return new Promise((resolve) => {
    const ws = new Socket(machine.origin + '/websocket');
    let finished = false;
    const timer = setTimeout(() => finish(empty('error', 'cc1-report')), 4000);
    const disconnect = () => finish(empty('offline', 'cc1-connection'));
    function finish(result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', disconnect);
      ws.close();
      resolve({ ...result, serial });
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
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message?.Topic !== `sdcp/status/${serial}`) return;
      const data = message.Status ?? message.Data?.Status ?? message.Data;
      const print = data?.PrintInfo;
      const status = states.get(print?.Status);
      if (!status) return;
      finish({
        status, issue: status === 'error' ? 'elegoo-print' : null,
        nozzle: temperature(data.TempOfNozzle), bed: temperature(data.TempOfHotbed),
        progress: status === 'done' ? 100 : Number.isFinite(print.Progress)
          ? Math.round(Math.max(0, Math.min(100, print.Progress))) : 0,
        file: typeof print.Filename === 'string' ? print.Filename.slice(0, 200) : ''
      });
    });
    if (signal?.aborted) disconnect();
    else signal?.addEventListener('abort', disconnect, { once: true });
  });
}
