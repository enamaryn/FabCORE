import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { Ray5Connection, Ray5Target, Ray5Snapshot, Ray5Options, Ray5Ports, Ray5Entry, Ray5Command, Ray5Pending } from './types.ts';

export function createRay5Services({ privateIPv4, openWS: defaultOpenWS }: Ray5Ports) {

  function ray5Target(machine: Ray5Connection): Ray5Target | null {
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
  const number = (value: unknown) => typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
  const states: Record<string, string> = { idle: 'ready', run: 'printing', hold: 'paused', alarm: 'error', door: 'paused', jog: 'connecting', home: 'connecting', check: 'connecting', sleep: 'error' };
  function parseRay5Status(line: unknown): Ray5Snapshot | null {
    if (typeof line !== 'string' || line.length > 2048 || !/^<[^<>\r\n]+>$/.test(line)) return null;
    const [nativeState = '', ...fields] = line.slice(1, -1).split('|');
    if (!/^(Idle|Run|Hold(?::[01])?|Alarm|Door(?::[0-3])?|Jog|Home|Check|Sleep)$/i.test(nativeState)) return null;
    const base = nativeState.split(':')[0]!.toLowerCase();
    const map = new Map(fields.map(item => { const at = item.indexOf(':'); return [item.slice(0, at), item.slice(at + 1)]; }));
    const coordinates = (key: string) => {
      const values = map.get(key)?.split(',');
      if (!values || values.length < 2 || values.length > 3) return null;
      const xyz = values.map(number);
      return xyz.some(n => n === null) ? null : { x: xyz[0]!, y: xyz[1]!, z: xyz[2] ?? null };
    };
    const feed = map.get('FS')?.split(',');
    const sd = map.get('SD');
    const comma = sd?.indexOf(',') ?? -1;
    const percent = number(comma < 0 ? sd : sd!.slice(0, comma));
    const progressKnown = percent !== null && percent >= 0 && percent <= 100;
    const file = comma >= 0 ? sd!.slice(comma + 1) : '';
    return {
      status: states[base]!, nativeState,
      issue: base === 'alarm' ? 'ray5-alarm' : base === 'door' ? 'ray5-door' : base === 'sleep' ? 'ray5-sleep' : ['jog', 'home', 'check'].includes(base) ? 'ray5-busy' : null,
      nozzle: null, bed: null, progress: progressKnown ? percent : 0, progressKnown,
      // GRBL filenames containing control bytes are rejected.
      // eslint-disable-next-line no-control-regex
      file: file.length <= 200 && !/[\x00-\x1f\x7f]/.test(file) ? file : '',
      machinePosition: coordinates('MPos'), workPosition: coordinates('WPos'),
      feedRate: number(feed?.[0]), spindle: number(feed?.[1])
    };
  }
  const unavailable = (status: string, issue: string): Ray5Snapshot => ({ status, issue, nozzle: null, bed: null, progress: 0, progressKnown: false, file: '', machinePosition: null, workPosition: null, feedRate: null, spindle: null });

  // Commands share the live TCP session; never queued offline or replayed.
  // One session per endpoint, shared by polling, probes and multiple viewers.
  function createRay5Monitor({ connectTCP = createConnection, openWS = defaultOpenWS, fetcher = fetch,
    diagnostics, now = Date.now, pollMs = 2000, staleMs = 10000, retryMs = 3000, probeMs = 4500, idleMs = 60000 }: Ray5Options = {}) {
    const entries = new Map<string, Ray5Entry>();
    let closed = false;
    const trace = (e: Ray5Entry, event: string, details: Record<string, unknown> = {}) => diagnostics?.trace?.(e.machine.id, event, { transport: e.target.transport, host: e.target.host, port: e.target.port, ...details });
    function stop(e: Ray5Entry) {
      e.pending?.reject(new Error('command-unconfirmed')); e.pending = null;
      e.stopped = true; e.current = null; e.issue = 'ray5-connection';
      clearInterval(e.poll); clearTimeout(e.idle);
      e.request?.abort();
      const socket = e.socket; e.socket = null;
      socket?.destroy?.(); socket?.terminate?.();
      for (const notify of e.waiters) notify();
      e.waiters.clear();
      entries.delete(e.key);
    }
    function fail(e: Ray5Entry, issue = 'ray5-connection') {
      if (e.stopped) return;
      clearInterval(e.poll); e.request?.abort();
      e.pending?.reject(new Error('command-unconfirmed')); e.pending = null;
      const socket = e.socket; e.socket = null;
      e.connected = false; e.current = null; e.page = null; e.buffer = ''; e.firmware = null;
      e.issue = issue;
      e.retryAt = now() + Math.min(30000, retryMs * 2 ** Math.min(e.failures++, 4));
      socket?.destroy?.(); socket?.terminate?.();
      trace(e, 'ray5-disconnected', { issue });
      for (const notify of e.waiters) notify();
    }
    function line(e: Ray5Entry, text: string) {
      const setting = /^\$(13|22|30|31|32|130|131)=(-?\d+(?:\.\d+)?)$/.exec(text);
      if (setting && Number.isFinite(Number(setting[2]))) e.settings[setting[1]!] = Number(setting[2]);
      if (text === 'ok' || /^error:\d+$/i.test(text)) {
        if (!e.initialized) { e.initialized = true; return; }
        if (e.pending) {
          const pending = e.pending;
          trace(e, 'ray5-command-response', { payload: text, outcome: text === 'ok' ? 'accepted' : 'rejected' });
          if (text !== 'ok') { e.pending = null; pending.resolve(false); if (pending.remaining > 1) fail(e); }
          else if (--pending.remaining === 0) { e.pending = null; pending.resolve(true); }
        }
      }

      const page = /^CURRENT_ID:(\d{1,8})$/.exec(text);
      if (page) { e.page = page[1]!; void poll(e); return; }
      const version = /^\[VER:([^\]\r\n]{1,120})\]$/.exec(text) ?? /^Grbl ([A-Za-z0-9.()_-]{1,80})/.exec(text);
      if (version) e.firmware = version[1]!;
      const alarm = /^ALARM:(\d{1,3})$/.exec(text);
      const report = parseRay5Status(alarm ? '<Alarm>' : text);
      if (!report) return;
      e.current = report; e.revision = (e.revision ?? 0) + 1; e.reportAt = now(); e.failures = 0; e.issue = null;
      trace(e, 'ray5-report', { status: report.status, issue: report.issue, payload: text });
      for (const notify of e.waiters) notify();
    }
    function consume(e: Ray5Entry, input: unknown, complete = false) {
      const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
      if (Buffer.byteLength(text) > 8192) return fail(e, 'ray5-response');
      e.buffer += text.replaceAll('\r', '\n');
      if (e.buffer.length > 8192) return fail(e, 'ray5-response');
      const parts = e.buffer.split('\n'); e.buffer = parts.pop()!;
      for (const part of parts) line(e, part.trim());
      if (complete || /^<[^<>\r\n]+>$/.test(e.buffer)) { line(e, e.buffer.trim()); e.buffer = ''; }
    }
    async function poll(e: Ray5Entry) {
      if (e.stopped || !e.connected) return;
      if (now() - (e.reportAt ?? e.openedAt) > staleMs) return fail(e, 'ray5-stale');
      if (e.target.transport === 'tcp') {
        try { if ((e.socket?.writableLength ?? 0) < 1024) e.socket?.write!('?'); } catch { fail(e); }
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
        let bytes = 0; const chunks: Buffer[] = [];
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
    function connect(e: Ray5Entry) {
      if (closed || e.stopped || e.socket || now() < e.retryAt) return;
      e.settings = {}; e.queried = false; e.initialized = false; e.current = null; e.reportAt = null; e.openedAt = now(); e.connected = false; e.issue = null;
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
          if (e.target.transport === 'tcp') { try { socket.write!('$I\n'); void poll(e); } catch { fail(e); } }
        };
        socket.on(e.target.transport === 'tcp' ? 'connect' : 'open', ready);
        socket.on(e.target.transport === 'tcp' ? 'data' : 'message', (data: unknown) => { if (valid()) consume(e, data, e.target.transport === 'esp3d'); });
        e.poll = setInterval(() => {
          if (!e.connected && now() - e.openedAt > 3500) fail(e);
          else void poll(e);
        }, pollMs); e.poll.unref?.();
      } catch { fail(e); }
    }
    function entry(machine: Ray5Connection) {
      const target = ray5Target(machine);
      if (closed || !target) return null;
      const key = machine.origin + '|' + target.wsPort;
      for (const e of entries.values()) if (e.machine.id === machine.id && e.key !== key) stop(e);
      let e = entries.get(key);
      if (!e) {
        e = { key, machine, target, waiters: new Set(), stopped: false, current: null, reportAt: null, openedAt: now(), buffer: '', settings: {}, queried: false, initialized: false, page: null, retryAt: 0, failures: 0, issue: null };
        entries.set(key, e);
      }
      e.machine = machine;
      clearTimeout(e.idle); e.idle = setTimeout(() => stop(e), idleMs); e.idle.unref?.();
      connect(e);
      return e;
    }
    function snapshot(e: Ray5Entry | null) {
      if (!e) return unavailable('error', 'ray5-address');
      if (e.current && now() - e.reportAt! <= staleMs) return { ...e.current, firmware: e.firmware, checkedAt: new Date(e.reportAt!).toISOString() };
      return unavailable(e.socket ? 'connecting' : ['ray5-access', 'ray5-response'].includes(e.issue!) ? 'error' : 'offline', e.issue ?? 'ray5-report');
    }
    function active(machine: Ray5Connection) {
      const e = entries.get(machine.origin + '|' + (machine.wsPort ?? 8849));
      if (!e || e.stopped || !e.connected || e.target.transport !== 'tcp' || !e.current || now() - e.reportAt! > staleMs) throw new Error('command-unconfirmed');
      return e;
    }
    function sendLine(machine: Ray5Connection, command: string | string[]) {
      const e = active(machine);
      if (!e.initialized || e.pending) throw new Error('command-busy');
      return new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(() => { if (e.pending === pending) fail(e); }, 3500);
        const pending: Ray5Pending = { remaining: Array.isArray(command) ? command.length : 1,
          resolve: ok => { clearTimeout(timer); resolve(ok); }, reject: err => { clearTimeout(timer); reject(err); } };
        e.pending = pending;
        trace(e, 'ray5-command-send', { payload: command });
        try { e.socket!.write!((Array.isArray(command) ? command.join('\n') : command) + '\n'); } catch { fail(e); }
      });
    }
    async function realtime(machine: Ray5Connection, byte: number, expected: (report: Ray5Snapshot) => boolean) {
      const e = active(machine), revision = e.revision;
      if (e.pending) throw new Error('command-busy');
      trace(e, 'ray5-command-send', { action: ({33:'pause',126:'resume',24:'reset',133:'jog-cancel'} as Record<number, string>)[byte] });
      if (byte === 24) { e.settings = {}; e.queried = false; e.initialized = false; }
      e.socket!.write!(Buffer.from([byte]));
      for (let i = 0; i < 35; i++) {
        if (e.stopped || !e.socket || !e.connected) throw new Error('command-unconfirmed');
        e.socket!.write!('?'); await delay(100);
        if (e.revision! > revision! && expected(e.current!)) {
          if (byte === 24) e.socket!.write!('$I\n');
          return true;
        }
      }
      throw new Error('command-unconfirmed');
    }
    async function settings(machine: Ray5Connection) {
      const e = active(machine);
      if (!e.queried && e.current!.nativeState === 'Idle' && e.initialized) {
        if (!await sendLine(machine, '$$')) throw new Error('command-rejected');
        e.queried = true;
      }
      return e.settings;
    }
    const control = {
      async read(machine: Ray5Connection) {
        let e, config;
        try { e = active(machine); config = await settings(machine); }
        catch { return { lights: [], heaters: [], fans: [], motion: null, laser: null }; }
        return { lights: [], heaters: [], fans: [], motion: { homed: null, axes: ['X','Y'], home: config['22'] === 1 },
          laser: { writable: e.initialized, max: config['30']! > 0 ? config['30']! : null, mode: config['32'] === 1, nativeState: e.current!.nativeState } };
      },
      async execute(machine: Ray5Connection, command: Ray5Command) {
        const e = active(machine), idle = e.current!.nativeState === 'Idle';
        const accepted = async (text: string | string[]) => { if (!await sendLine(machine, text)) throw new Error('command-rejected'); };
        if (command.action === 'reset') return { outcome: await realtime(machine,24,r => ['Idle','Alarm'].includes(r.nativeState!) && r.spindle === 0 && r.feedRate === 0) ? 'confirmed' : 'rejected' };
        if (command.action === 'jog-cancel') return { outcome: await realtime(machine,133,r => r.nativeState === 'Idle' && r.spindle === 0) ? 'confirmed' : 'rejected' };
        if (command.action === 'unlock') {
          if (e.current!.nativeState !== 'Alarm') throw new Error('command-rejected');
          await accepted('$X'); return { outcome: 'accepted' };
        }
        if (command.action === 'laser-off') { await accepted('M5'); return { outcome: 'accepted' }; }
        if (!idle) throw new Error('command-rejected');
        if (command.action === 'move') {
          if (!['X','Y'].includes(command.axis!) || ![0.1,1,10].includes(Math.abs(command.distance!))) throw new Error('command-rejected');
          await accepted('M5');
          if (e.current!.nativeState !== 'Idle') throw new Error('command-rejected');
          await accepted(`$J=G91 G21 ${command.axis}${command.distance} F600`);
        } else if (command.action === 'home') {
          if ((await settings(machine))['22'] !== 1) throw new Error('command-rejected');
          await accepted('M5'); await accepted('$H');
        } else if (command.action === 'zero') { await accepted('M5'); await accepted('G10 L20 P1 X0 Y0'); }
        else if (command.action === 'laser-pulse') {
          const config = await settings(machine), power = Math.floor(config['30']! * command.value! / 100);
          if (!Number.isFinite(power) || config['30']! > 1000000 || command.operatorPresent !== true || config['32'] !== 1 || !(config['30']! > 0) || !(power >= Math.max(1,config['31'] ?? 0)) || !Number.isInteger(command.value) || command.value! < 1 || command.value! > 5 || ![100,250,500].includes(command.duration!)) throw new Error('command-rejected');
          // Entire short block includes dwell and M5. Count all four acknowledgements.
          await accepted(['M5','G1 M3 S' + power,'G4 P' + command.duration!/1000,'M5']);
        } else throw new Error('command-rejected');
        return { outcome: 'accepted' };
      }
    };
    return {
      control,
      async command(machine: Ray5Connection, action: string) {
        const native = active(machine).current!.nativeState;
        if (action === 'pause' && native === 'Run') return realtime(machine,33,r => r.nativeState === 'Hold:0' && r.spindle === 0);
        if (action === 'resume' && native === 'Hold:0') return realtime(machine,126,r => r.nativeState === 'Run');
        if (action === 'stop' && /^(Run|Hold)/.test(native!)) return realtime(machine,24,r => ['Idle','Alarm'].includes(r.nativeState!) && r.spindle === 0 && r.feedRate === 0);
        return false;
      },
      read(machine: Ray5Connection) { const e = entry(machine); if (e?.current && now() - e.reportAt! > staleMs) fail(e, 'ray5-stale'); return snapshot(e); },
      async probe(machine: Ray5Connection, { signal }: { signal?: AbortSignal } = {}) {
        if (signal?.aborted) return { ok: false, issue: 'ray5-connection' };
        const e = entry(machine);
        if (!e || signal?.aborted) return { ok: false, issue: e ? 'ray5-connection' : 'ray5-address' };
        return new Promise<{ ok: boolean; issue: string | null }>(resolve => {
          const finish = () => {
            if (!e.current && !e.issue && !e.stopped && !signal?.aborted) return;
            clearTimeout(timer); signal?.removeEventListener('abort', aborted); e.waiters.delete(finish);
            const result = snapshot(e);
            resolve({ ok: Boolean(e.current && now() - e.reportAt! <= staleMs), issue: result.issue });
          };
          const aborted = () => { clearTimeout(timer); e.waiters.delete(finish); signal?.removeEventListener('abort', aborted); resolve({ ok: false, issue: 'ray5-connection' }); };
          const timer = setTimeout(() => { e.waiters.delete(finish); signal?.removeEventListener('abort', aborted); resolve({ ok: false, issue: e.issue ?? 'ray5-report' }); }, probeMs);
          signal?.addEventListener('abort', aborted, { once: true }); e.waiters.add(finish); finish();
        });
      },
      forget(id: string) { for (const e of entries.values()) if (e.machine.id === id) stop(e); },
      close() { closed = true; for (const e of entries.values()) stop(e); }
    };
  }

  return { ray5Target, parseRay5Status, createRay5Monitor };
}
