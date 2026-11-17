import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { privateIPv4 } from './connector-http.mjs';

const maxFrame = 65536;
const states = new Map([
  ['Initial', 'connecting'], ['Idle', 'ready'], ['Sleep', 'ready'], ['WorkReady', 'ready'],
  ['WorkPlay', 'printing'], ['WorkPause', 'paused'], ['WorkCancel', 'printing'], ['WorkDone', 'done'],
  ['finish', 'done'], ['Error', 'error'], ['P_IDLE', 'ready'], ['P_PROCESSING', 'printing'],
  ['P_PAUSE', 'paused'], ['P_FINISH', 'done'], ['P_ERROR', 'error'],
  ['P_FRAMING', 'printing'], ['P_FRAME_READY', 'ready'], ['P_PROCESSING_READY', 'ready'],
  ['P_FINISH_PROCESSING', 'done'], ['P_SLEEP', 'ready'], ['P_INITIALIZING', 'connecting'],
  ['P_EMERGENCY_STOP', 'error']
]);

function crc16(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xA001 : 0);
  }
  return crc;
}

function encode(value) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(10);
  header.writeUInt16BE(0xBABE);
  header.writeUIntBE(body.length, 2, 3);
  header[5] = 4;
  header.writeUInt16BE(crc16(body), 6);
  header.writeUInt16BE(crc16(header.subarray(0, 8)), 8);
  return Buffer.concat([header, body]);
}

const result = (status, issue = null) => ({ status, issue, nozzle: null, bed: null, progress: 0, file: '' });

export function readXTool(machine, { signal, identityOnly = false, pairing = false, Socket = WebSocket } = {}) {
  const url = new URL(machine.origin);
  if (url.protocol !== 'wss:' || !privateIPv4(url.hostname) || url.port !== '28900' || signal?.aborted) {
    return Promise.resolve(result('offline', 'xtool-connection'));
  }
  url.pathname = '/websocket';
  url.search = new URLSearchParams({ id: randomUUID(), function: 'instruction' }).toString();

  return new Promise((resolve) => {
    const ws = new Socket(url, { rejectUnauthorized: false, followRedirects: false,
      origin: 'atomm://renderer', handshakeTimeout: 4000, maxPayload: maxFrame });
    let buffer = Buffer.alloc(0);
    let finished = false;
    let serial;
    let fingerprint;
    let transaction = 0;
    let step = 0;
    let poll;
    let awaitingConfirmation = false;
    let sessionToken;
    let pairingToken;
    let reportedState;
    let syncAcknowledged = false;
    const requests = [
      ['GET', '/v1/user/parity', { userID: 'mk-guest', userKey: 'bWFrZWJsb2NrLXh0b29s', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(pairing || machine.pairingToken ? { token: pairing ? '' : machine.pairingToken } : {}) }],
      ['GET', '/v1/platform/device/machine-info', {}],
      ['POST', '/v1/platform/device/state/sync', {}]
    ];
    const disconnect = () => finish(result('offline', 'xtool-connection'));
    const timer = setTimeout(() => finish(result('error', awaitingConfirmation ? 'xtool-pairing-timeout' : 'xtool-protocol')),
      pairing ? 45_000 : 12_000);
    function finish(state) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(poll);
      signal?.removeEventListener('abort', disconnect);
      ws.terminate();
      resolve(state);
    }
    function send(method, path, data = {}) {
      ws.send(encode({ type: 'request', method, url: path, params: {}, data, timestamp: Date.now(),
        transactionId: ++transaction, ...(sessionToken ? { sessionToken } : {}) }));
    }
    function sendNext() {
      send(...requests[step++]);
    }
    function waitForConfirmation() {
      awaitingConfirmation = true;
      clearTimeout(poll);
      poll = setTimeout(() => send('GET', '/v1/user/auth-status'), 1000);
    }
    ws.on('error', disconnect);
    ws.on('close', disconnect);
    ws.on('upgrade', (response) => {
      fingerprint = response.socket.getPeerCertificate()?.fingerprint256;
      if (!fingerprint || (machine.fingerprint && machine.fingerprint !== fingerprint)) {
        finish(result('error', 'xtool-identity'));
      }
    });
    ws.on('open', () => { if (!finished) sendNext(); });
    function completeStatus() {
      if (!serial || !syncAcknowledged || !reportedState) return;
      finish({ ...result(reportedState, reportedState === 'error' ? 'xtool-device' : null),
        serial, fingerprint, ...(pairingToken ? { pairingToken } : {}) });
    }
    function handleResponse(payload) {
      let message;
      try { message = JSON.parse(payload); } catch { return finish(result('error', 'xtool-protocol')); }
      const push = message?.data?.['/v1/platform/device/state'];
      if (message?.type === 'request' || message?.method === 'REPORT') {
        const state = states.get(push?.curMode?.mode);
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
      if (pairing && step === 1 && [409, 503].includes(message.code)) return finish(result('error', 'xtool-pairing-busy'));
      if (message.code != null && message.code !== 0) return finish(result('error', 'xtool-protocol'));
      if (step === 1) {
        if (typeof message.data?.sessionToken === 'string') sessionToken = message.data.sessionToken;
        if (pairing && typeof message.data?.token === 'string' && message.data.token) pairingToken = message.data.token;
        if (awaitingConfirmation && !pairingToken) return finish(result('error', 'xtool-authorization'));
        awaitingConfirmation = false;
      }
      if (step === 2) {
        serial = message.data?.sn || message.data?.snCode;
        if (typeof serial !== 'string' || !/^[A-Za-z0-9_-]{6,64}$/.test(serial) || (machine.serial && machine.serial !== serial)) {
          return finish(result('error', 'xtool-identity'));
        }
        if (identityOnly) return finish({ serial, fingerprint });
      }
      if (step < 3) sendNext();
      else {
        syncAcknowledged = true;
        const state = states.get(message.data?.curMode?.mode);
        if (state) reportedState = state;
        completeStatus();
      }
    }
    ws.on('message', (data, binary) => {
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
        if ((frame[5] & 0x7F) !== 4) continue;
        const body = frame.subarray(10);
        if (!(frame[5] & 0x80) && frame.readUInt16BE(6) !== crc16(body)) return finish(result('error', 'xtool-protocol'));
        handleResponse(body);
      }
    });
    if (signal?.aborted) disconnect();
    else signal?.addEventListener('abort', disconnect, { once: true });
  });
}
