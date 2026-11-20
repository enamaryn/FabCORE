import { createConnection } from 'node:net';
import WebSocket from 'ws';
import { privateIPv4 } from './connector-http.mjs';

export function ray5Target(machine) {
  try {
    const url = new URL(machine.origin);
    if (!['tcp:', 'http:'].includes(url.protocol) || !privateIPv4(url.hostname) || url.username || url.password ||
        !['', '/'].includes(url.pathname) || url.search || url.hash) return null;
    const port = Number(url.port || (url.protocol === 'http:' ? 80 : 0));
    const wsPort = machine.wsPort ?? 8849;
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(wsPort) || wsPort < 1 || wsPort > 65535) return null;
    return { host: url.hostname, port, wsPort, transport: url.protocol === 'tcp:' ? 'tcp' : 'esp3d' };
  } catch { return null; }
}
const number = value => typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
const states = { idle: 'ready', run: 'printing', hold: 'paused', alarm: 'error', door: 'paused', jog: 'connecting', home: 'connecting', check: 'connecting', sleep: 'error' };
export function parseRay5Status(line) {
  if (typeof line !== 'string' || line.length > 2048 || !/^<[^<>\r\n]+>$/.test(line)) return null;
  const [nativeState, ...fields] = line.slice(1, -1).split('|');
  if (!/^(Idle|Run|Hold(?::[01])?|Alarm|Door(?::[0-3])?|Jog|Home|Check|Sleep)$/i.test(nativeState)) return null;
  const base = nativeState.split(':')[0].toLowerCase();
  const map = new Map(fields.map(item => { const at = item.indexOf(':'); return [item.slice(0, at), item.slice(at + 1)]; }));
  const coordinates = key => {
    const values = map.get(key)?.split(',');
    if (!values || values.length < 2 || values.length > 3) return null;
    const xyz = values.map(number);
    return xyz.some(n => n === null) ? null : { x: xyz[0], y: xyz[1], z: xyz[2] ?? null };
  };
  const feed = map.get('FS')?.split(',');
  const sd = map.get('SD');
  const comma = sd?.indexOf(',') ?? -1;
  const percent = number(comma < 0 ? sd : sd.slice(0, comma));
  const progressKnown = percent !== null && percent >= 0 && percent <= 100;
  const file = comma >= 0 ? sd.slice(comma + 1) : '';
  return {
    status: states[base], nativeState,
    issue: base === 'alarm' ? 'ray5-alarm' : base === 'door' ? 'ray5-door' : base === 'sleep' ? 'ray5-sleep' : ['jog', 'home', 'check'].includes(base) ? 'ray5-busy' : null,
    nozzle: null, bed: null, progress: progressKnown ? percent : 0, progressKnown,
    file: file.length <= 200 && !/[\x00-\x1f\x7f]/.test(file) ? file : '',
    machinePosition: coordinates('MPos'), workPosition: coordinates('WPos'),
    feedRate: number(feed?.[0]), spindle: number(feed?.[1])
  };
}
const unavailable = (status, issue) => ({ status, issue, nozzle: null, bed: null, progress: 0, progressKnown: false, file: '', machinePosition: null, workPosition: null, feedRate: null, spindle: null });

// Read-only by construction: only '?' and the GRBL build-info query '$I' are emitted.
// One session per endpoint, shared by polling, probes and multiple viewers.
export function createRay5Monitor({ connectTCP = createConnection, openWS = (url) => new WebSocket(url, 'arduino', { maxPayload: 8192, handshakeTimeout: 3500, followRedirects: false }), fetcher = fetch,
  diagnostics, now = Date.now, pollMs = 2000, staleMs = 10000, retryMs = 3000, probeMs = 4500, idleMs = 60000 } = {}) {
  const entries = new Map();
  let closed = false;
  const trace = (e, event, details = {}) => diagnostics?.trace?.(e.machine.id, event, { transport: e.target.transport, host: e.target.host, port: e.target.port, ...details });
  function stop(e) {
    e.stopped = true; e.current = null; e.issue = 'ray5-connection';
    clearInterval(e.poll); clearTimeout(e.idle);
    e.request?.abort();
    const socket = e.socket; e.socket = null;
    socket?.destroy?.(); socket?.terminate?.();
    for (const notify of e.waiters) notify();
    e.waiters.clear();
    entries.delete(e.key);
  }
  function fail(e, issue = 'ray5-connection') {
    if (e.stopped) return;
    clearInterval(e.poll); e.request?.abort();
    const socket = e.socket; e.socket = null;
    e.connected = false; e.current = null; e.page = null; e.buffer = ''; e.firmware = null;
    e.issue = issue;
    e.retryAt = now() + Math.min(30000, retryMs * 2 ** Math.min(e.failures++, 4));
    socket?.destroy?.(); socket?.terminate?.();
    trace(e, 'ray5-disconnected', { issue });
    for (const notify of e.waiters) notify();
  }
  function line(e, text) {
    const page = /^CURRENT_ID:(\d{1,8})$/.exec(text);
    if (page) { e.page = page[1]; poll(e); return; }
    const version = /^\[VER:([^\]\r\n]{1,120})\]$/.exec(text) ?? /^Grbl ([A-Za-z0-9.()_-]{1,80})/.exec(text);
    if (version) e.firmware = version[1];
    const alarm = /^ALARM:(\d{1,3})$/.exec(text);
    const report = parseRay5Status(alarm ? '<Alarm>' : text);
    if (!report) return;
    e.current = report; e.reportAt = now(); e.failures = 0; e.issue = null;
    trace(e, 'ray5-report', { status: report.status, issue: report.issue, payload: text });
    for (const notify of e.waiters) notify();
  }
  function consume(e, input, complete = false) {
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
    if (Buffer.byteLength(text) > 8192) return fail(e, 'ray5-response');
    e.buffer += text.replaceAll('\r', '\n');
    if (e.buffer.length > 8192) return fail(e, 'ray5-response');
    const parts = e.buffer.split('\n'); e.buffer = parts.pop();
    for (const part of parts) line(e, part.trim());
    if (complete || /^<[^<>\r\n]+>$/.test(e.buffer)) { line(e, e.buffer.trim()); e.buffer = ''; }
  }
  async function poll(e) {
    if (e.stopped || !e.connected) return;
    if (now() - (e.reportAt ?? e.openedAt) > staleMs) return fail(e, 'ray5-stale');
    if (e.target.transport === 'tcp') {
      try { if ((e.socket?.writableLength ?? 0) < 1024) e.socket?.write('?'); } catch { fail(e); }
      return;
    }
    if (!e.page || e.request) return;
    const socket = e.socket;
    const controller = new AbortController(); e.request = controller;
    const timeout = setTimeout(() => controller.abort(), 1500); timeout.unref?.();
    try {
      const url = `http://${e.target.host}:${e.target.port}/command?` + new URLSearchParams({ commandText: '?', PAGEID: e.page });
      const response = await fetcher(url, { method: 'GET', redirect: 'error', signal: controller.signal });
      if (e.stopped || e.socket !== socket || controller.signal.aborted) { await response.body?.cancel(); return; }
      trace(e, 'ray5-status-request', { method: 'GET', path: '/command', status: response.status });
      if (response.status === 401 || response.status === 403) { await response.body?.cancel(); return fail(e, 'ray5-access'); }
      // HTTP 200 / 'ok' / 'Error' is not machine status; only a valid report counts.
      if (!response.ok) { await response.body?.cancel(); return; }
      const reader = response.body?.getReader();
      if (!reader) return;
      let bytes = 0; const chunks = [];
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          bytes += value.byteLength;
          if (bytes > 8192) { await reader.cancel(); return fail(e, 'ray5-response'); }
          chunks.push(Buffer.from(value));
        }
        if (e.socket === socket && !e.stopped && !controller.signal.aborted) for (const text of Buffer.concat(chunks).toString('utf8').split(/[\r\n]+/)) line(e, text.trim());
      } finally { reader.releaseLock(); }
    } catch { /* WebSocket may still have provided the requested report. Staleness is checked separately. */ }
    finally { clearTimeout(timeout); if (e.request === controller) e.request = null; }
  }
  function connect(e) {
    if (closed || e.stopped || e.socket || now() < e.retryAt) return;
    e.current = null; e.reportAt = null; e.openedAt = now(); e.connected = false; e.issue = null;
    trace(e, 'ray5-connecting');
    try {
      const socket = e.target.transport === 'tcp' ? connectTCP({ host: e.target.host, port: e.target.port }) : openWS(`ws://${e.target.host}:${e.target.wsPort}/`);
      e.socket = socket;
      const valid = () => !e.stopped && e.socket === socket;
      socket.on('error', () => { if (valid()) fail(e); });
      socket.on('close', () => { if (valid()) fail(e); });
      const ready = () => {
        if (!valid()) return;
        e.connected = true; e.openedAt = now();
        trace(e, 'ray5-connected');
        if (e.target.transport === 'tcp') { try { socket.write('$I\n'); poll(e); } catch { fail(e); } }
      };
      socket.on(e.target.transport === 'tcp' ? 'connect' : 'open', ready);
      socket.on(e.target.transport === 'tcp' ? 'data' : 'message', data => { if (valid()) consume(e, data, e.target.transport === 'esp3d'); });
      e.poll = setInterval(() => {
        if (!e.connected && now() - e.openedAt > 3500) fail(e);
        else poll(e);
      }, pollMs); e.poll.unref?.();
    } catch { fail(e); }
  }
  function entry(machine) {
    const target = ray5Target(machine);
    if (closed || !target) return null;
    const key = machine.origin + '|' + target.wsPort;
    for (const e of entries.values()) if (e.machine.id === machine.id && e.key !== key) stop(e);
    let e = entries.get(key);
    if (!e) {
      e = { key, machine, target, waiters: new Set(), stopped: false, current: null, reportAt: null, openedAt: now(), buffer: '', page: null, retryAt: 0, failures: 0, issue: null };
      entries.set(key, e);
    }
    e.machine = machine;
    clearTimeout(e.idle); e.idle = setTimeout(() => stop(e), idleMs); e.idle.unref?.();
    connect(e);
    return e;
  }
  function snapshot(e) {
    if (!e) return unavailable('error', 'ray5-address');
    if (e.current && now() - e.reportAt <= staleMs) return { ...e.current, firmware: e.firmware, checkedAt: new Date(e.reportAt).toISOString() };
    return unavailable(e.socket ? 'connecting' : ['ray5-access', 'ray5-response'].includes(e.issue) ? 'error' : 'offline', e.issue ?? 'ray5-report');
  }
  return {
    read(machine) { const e = entry(machine); if (e?.current && now() - e.reportAt > staleMs) fail(e, 'ray5-stale'); return snapshot(e); },
    async probe(machine, { signal } = {}) {
      if (signal?.aborted) return { ok: false, issue: 'ray5-connection' };
      const e = entry(machine);
      if (!e || signal?.aborted) return { ok: false, issue: e ? 'ray5-connection' : 'ray5-address' };
      return new Promise(resolve => {
        let timer;
        const finish = () => {
          if (!e.current && !e.issue && !e.stopped && !signal?.aborted) return;
          clearTimeout(timer); signal?.removeEventListener('abort', aborted); e.waiters.delete(finish);
          const result = snapshot(e);
          resolve({ ok: Boolean(e.current && now() - e.reportAt <= staleMs), issue: result.issue });
        };
        const aborted = () => { clearTimeout(timer); e.waiters.delete(finish); signal?.removeEventListener('abort', aborted); resolve({ ok: false, issue: 'ray5-connection' }); };
        timer = setTimeout(() => { e.waiters.delete(finish); signal?.removeEventListener('abort', aborted); resolve({ ok: false, issue: e.issue ?? 'ray5-report' }); }, probeMs);
        signal?.addEventListener('abort', aborted, { once: true }); e.waiters.add(finish); finish();
      });
    },
    forget(id) { for (const e of entries.values()) if (e.machine.id === id) stop(e); },
    close() { closed = true; for (const e of entries.values()) stop(e); }
  };
}
