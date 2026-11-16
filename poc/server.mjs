import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { commandMoonraker, moonrakerOrigin, privateIPv4, readMoonraker } from './moonraker.mjs';
import { createBambuMonitor } from './bambu.mjs';
import { identifyElegoo, readElegoo } from './elegoo.mjs';
import { readElegooCC1 } from './elegoo-cc1.mjs';
import { discoveryNetworks, scanNetwork } from './discovery.mjs';
import { cameraURL, streamCamera } from './camera.mjs';
import { createOidc } from './oidc.mjs';
import { internalNtfy, notificationSettings, publicNotifications, sendNotification } from './notifications.mjs';
import { readXTool } from './xtool.mjs';
import { openStore } from './store.mjs';

const machineModels = {
  klipper: 'Klipper · Moonraker',
  bambu: 'Bambu Lab · P2S',
  elegoo: 'Elegoo · Centauri Carbon 2',
  'elegoo-cc1': 'Elegoo · Centauri Carbon',
  'xtool-m2': 'xTool · M2'
};

const derive = promisify(scrypt);
const digest = (secret) => createHash('sha256').update(secret).digest();
const sessionAge = 8 * 60 * 60 * 1000;
const activationAge = 15 * 60 * 1000;
const minute = 60_000;
const shared = readFileSync(new URL('../design/prototype.html', import.meta.url), 'utf8');
const sharedScript = shared.match(/<script>([\s\S]+)<\/script>/)[1];
const liveHtml = shared
  .replace('<html lang="fr">', '<html lang="fr" data-live>')
  .replace('href="brand/favicon.svg"', 'href="/favicon.svg"')
  .replace(/<script>[\s\S]+<\/script>/, '<script src="/shared.js"></script><script src="/live.js"></script>');
const assets = new Map([
  ['/', ['text/html; charset=utf-8', liveHtml]],
  ['/shared.js', ['text/javascript; charset=utf-8', sharedScript]],
  ['/live.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./live.js', import.meta.url))]],
  ['/favicon.svg', ['image/svg+xml', readFileSync(new URL('../design/brand/favicon.svg', import.meta.url))]]
]);

function answer(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(payload));
}

function error(res, status, code) {
  answer(res, status, { error: code });
}

async function readJson(req) {
  let size = 0;
  const parts = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 4096) {
      req.resume();
      throw new Error('body');
    }
    parts.push(chunk);
  }
  const data = JSON.parse(Buffer.concat(parts).toString('utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('body');
  return data;
}

function value(data, key, max) {
  return typeof data[key] === 'string' && data[key].length <= max ? data[key] : '';
}

function monitor(readPrinter) {
  const cache = new Map();
  function snapshot(machine) {
    let entry = cache.get(machine.id);
    if (!entry) {
      entry = { current: { status: 'connecting', issue: null, progress: 0, nozzle: null, bed: null, file: '' }, next: 0 };
      cache.set(machine.id, entry);
    }
    if (!entry.pending && Date.now() >= entry.next) {
      entry.pending = Promise.resolve().then(() => readPrinter(machine)).then(
        (result) => { entry.current = result; },
        () => { entry.current = { status: 'offline', issue: 'connection', progress: 0, nozzle: null, bed: null, file: '' }; }
      ).finally(() => {
        entry.checkedAt = new Date().toISOString();
        entry.next = Date.now() + (machine.kind === 'xtool-m2' ? 15000 : machine.kind?.startsWith('elegoo') ? 7000 : 1000);
        entry.pending = null;
      });
    }
    return { ...entry.current, checkedAt: entry.checkedAt ?? null };
  }
  snapshot.forget = (id) => cache.delete(id);
  return snapshot;
}

export function createFabCore({ directory, origin, readPrinter = readMoonraker, sendCommand = commandMoonraker, readCC2 = readElegoo, identifyCC2 = identifyElegoo, readCC1 = readElegooCC1, bambu = createBambuMonitor(), activationToken, networks = discoveryNetworks, scan = scanNetwork, openCamera, oidc, notify = sendNotification } = {}) {
  const publicUrl = new URL(origin);
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.href !== publicUrl.origin + '/') {
    throw new Error('FABCORE_ORIGIN doit contenir une origine HTTP ou HTTPS.');
  }
  const secure = publicUrl.protocol === 'https:';
  const allowedHost = publicUrl.host;
  const store = openStore(directory);
  const token = store.state.admin ? null : (activationToken ?? randomBytes(24).toString('base64url'));
  const activation = token ? { hash: digest(token), expires: Date.now() + activationAge } : null;
  const sessions = new Map();
  const attempts = new Map();
  const elegooReaders = new Map([['elegoo', readCC2], ['elegoo-cc1', readCC1]]);
  const snapshot = monitor(async (machine) => {
    if (machine.kind === 'xtool-m2') {
      const { serial, fingerprint, ...telemetry } = await readXTool(machine);
      return telemetry;
    }
    const reader = elegooReaders.get(machine.kind);
    if (!reader) return readPrinter(machine);
    const { serial, ...telemetry } = await reader(machine);
    return telemetry;
  });
  const pendingCommands = new Set();
  let probes = 0;
  let discoveryActive = false;
  const notificationTests = new Set();
  const cameraStreams = new Map();
  const stopCameraStreams = (sessionId) => {
    for (const [controller, { owner }] of cameraStreams) {
      if (owner === sessionId) controller.abort();
    }
  };
  function cookie(value, age) {
    return `fabcore_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
  }
  function session(req) {
    const id = req.headers.cookie?.match(/(?:^|;\s*)fabcore_session=([\w-]{43})(?:;|$)/)?.[1];
    if (!id) return null;
    const key = digest(id).toString('hex');
    if (sessions.get(key)?.expires > Date.now()) return key;
    sessions.delete(key);
    return null;
  }
  function newSession(username, role) {
    const id = randomBytes(32).toString('base64url');
    for (const [key, entry] of sessions) if (entry.expires <= Date.now()) sessions.delete(key);
    if (sessions.size >= 32) {
      const oldest = sessions.keys().next().value;
      sessions.delete(oldest);
      stopCameraStreams(oldest);
    }
    sessions.set(digest(id).toString('hex'), { expires: Date.now() + sessionAge, username, role });
    return cookie(id, sessionAge / 1000);
  }
  function signIn(res, username, role) {
    answer(res, 200, { authenticated: true, username, role }, { 'Set-Cookie': newSession(username, role) });
  }
  function withinLimit(route) {
    const now = Date.now();
    let bucket = attempts.get(route);
    if (!bucket || bucket.reset <= now) {
      bucket = { count: 0, reset: now + minute };
      attempts.set(route, bucket);
    }
    return ++bucket.count <= 8;
  }
  function requireJson(req, res) {
    if (req.headers.origin !== publicUrl.origin) {
      error(res, 403, 'origin');
      return false;
    }
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
      error(res, 415, 'invalid');
      return false;
    }
    return true;
  }
  async function route(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (req.headers.host !== allowedHost) return error(res, 421, 'host');
    const path = req.url;
    const asset = path === '/?auth=oidc-failed' ? '/' : path;
    if (req.method === 'GET' && assets.has(asset)) {
      const [type, body] = assets.get(asset);
      res.writeHead(200, { 'Content-Type': type });
      return res.end(body);
    }
    const activeSession = session(req);
    const viewer = sessions.get(activeSession);
    if (req.method === 'GET' && (path === '/api/oidc/start' || path.split('?')[0] === '/api/oidc/callback')) {
      if (!secure || !oidc || !store.state.admin) return error(res, 404, 'missing');
      const redirect = (destination, cookies) => {
        res.writeHead(303, { Location: destination, 'Set-Cookie': cookies });
        res.end();
      };
      try {
        if (path === '/api/oidc/start') {
          if (!withinLimit(path)) return error(res, 429, 'rate');
          const flow = await oidc.begin();
          return redirect(flow.url, flow.cookie);
        }
        const query = new URLSearchParams(path.split('?').slice(1).join('?'));
        const account = await oidc.complete(query, req.headers.cookie);
        if (account) {
          if (activeSession) {
            sessions.delete(activeSession);
            stopCameraStreams(activeSession);
          }
          return redirect('/', [oidc.clearCookie, newSession(account.username, account.role)]);
        }
      } catch { /* The local login page remains available when OIDC fails. */ }
      return redirect('/?auth=oidc-failed', oidc.clearCookie);
    }
    if (req.method === 'GET' && path === '/api/session') {
      return answer(res, 200, {
        installed: Boolean(store.state.admin), authenticated: Boolean(activeSession),
        username: viewer?.username ?? null, ...(viewer ? { role: viewer.role } : {}),
        ...(secure && oidc && store.state.admin ? { oidcEnabled: true } : {})
      });
    }
    const camera = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/camera$/);
    if (req.method === 'GET' && camera) {
      if (!activeSession) return error(res, 401, 'sign-in');
      const machine = store.state.machines.find(({ id }) => id === camera[1]);
      const url = machine && cameraURL(machine);
      if (!url) return error(res, 404, 'camera-unsupported');
      const existingStream = [...cameraStreams].find(([, stream]) => stream.id === machine.id && !stream.signal.aborted);
      if (existingStream && existingStream[1].owner !== activeSession) return error(res, 429, 'camera-busy');
      if (!existingStream && cameraStreams.size >= 8) return error(res, 429, 'camera-busy');
      if (existingStream) {
        const [previous] = existingStream;
        previous.abort();
        cameraStreams.delete(previous);
      }
      const controller = new AbortController();
      const stop = () => controller.abort();
      const expires = setTimeout(stop, Math.max(0, viewer.expires - Date.now()));
      cameraStreams.set(controller, { owner: activeSession, id: machine.id, signal: controller.signal });
      res.once('close', stop);
      try {
        const identify = machine.kind === 'elegoo' ? identifyCC2 : elegooReaders.get(machine.kind);
        const identity = await identify(machine, { signal: controller.signal });
        if (controller.signal.aborted) return res.destroy();
        if (identity.serial !== machine.serial || (identity.issue && identity.issue !== 'elegoo-print')) {
          return error(res, 502, 'camera-unavailable');
        }
        if (!(await streamCamera(url, res, controller.signal, openCamera))) return error(res, 502, 'camera-unavailable');
      } catch {
        if (controller.signal.aborted || res.headersSent) res.destroy();
        else error(res, 502, 'camera-unavailable');
      } finally {
        clearTimeout(expires);
        res.off('close', stop);
        cameraStreams.delete(controller);
      }
      return;
    }
    if (path === '/api/notifications' || path === '/api/notifications/test') {
      if (!viewer) return error(res, 401, 'sign-in');
      if (viewer.role !== 'admin') return error(res, 403, 'forbidden');
      const internal = internalNtfy(directory);
      const current = store.state.notifications ?? {};
      if (req.method === 'GET' && path === '/api/notifications') {
        return answer(res, 200, publicNotifications(current, internal));
      }
      if (req.method !== 'POST') return error(res, 405, 'missing');
      if (!requireJson(req, res)) return;
      let data;
      try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
      if (path === '/api/notifications') {
        let settings;
        try { settings = notificationSettings(data, store.state.notifications, internal); }
        catch (failure) { return error(res, 400, failure.message === 'ntfy-install-required' ? failure.message : 'notifications-invalid'); }
        store.save({ ...store.state, notifications: settings });
        return answer(res, 200, publicNotifications(settings, internal));
      }
      const channel = data.channel;
      if (channel !== 'ntfy' && channel !== 'smtp') return error(res, 400, 'invalid');
      if (notificationTests.has(channel) || !withinLimit(path + '/' + channel)) return error(res, 429, 'rate');
      notificationTests.add(channel);
      try {
        if (await notify(channel, store.state.notifications ?? {}, internal)) return answer(res, 200, { accepted: true });
      } catch { /* Avoid returning provider responses that may contain secrets. */ }
      finally { notificationTests.delete(channel); }
      return error(res, 502, 'notifications-failed');
    }
    if (path === '/api/discovery') {
      if (!viewer) return error(res, 401, 'sign-in');
      if (viewer.role !== 'admin') return error(res, 403, 'forbidden');
      const available = networks();
      if (req.method === 'GET') return answer(res, 200, { networks: available.map(({ cidr }) => cidr) });
      if (req.method !== 'POST') return error(res, 405, 'missing');
      if (!requireJson(req, res)) return;
      let data;
      try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
      const network = available.find(({ cidr }) => cidr === data.network);
      if (!network) return error(res, 400, 'discovery-network');
      if (discoveryActive) return error(res, 429, 'discovery-busy');
      const abort = new AbortController();
      const stop = () => abort.abort();
      res.once('close', stop);
      discoveryActive = true;
      try {
        const found = await scan(network, abort.signal);
        if (abort.signal.aborted) return;
        const devices = found.map((device) => ({
          ...device,
          registered: store.state.machines.some((machine) => (machine.kind ?? 'klipper') === device.kind &&
            (device.origin === machine.origin || (device.serial && device.serial === machine.serial) ||
              (device.kind !== 'klipper' && new URL(machine.origin).hostname === device.host)))
        }));
        return answer(res, 200, { devices });
      } finally {
        res.off('close', stop);
        discoveryActive = false;
      }
    }
    if (req.method === 'GET' && path === '/api/machines') {
      if (!activeSession) return error(res, 401, 'sign-in');
      return answer(res, 200, { machines: store.state.machines.map((machine) => ({
        id: machine.id, name: machine.name, origin: machine.origin, kind: machine.kind ?? 'klipper', serial: machine.serial, model: machineModels[machine.kind] ?? machineModels.klipper,
        cameraOpen: [...cameraStreams.values()].some(({ owner, id }) => owner === activeSession && id === machine.id),
        ...(machine.kind === 'bambu' ? bambu.read(machine) : snapshot(machine))
      })) });
    }
    const command = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/command$/);
    if (req.method === 'POST' && command) {
      if (!viewer) return error(res, 401, 'sign-in');
      if (viewer.role !== 'admin') return error(res, 403, 'forbidden');
      if (!requireJson(req, res)) return;
      let data;
      try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
      const action = data.action;
      if (action !== 'pause' && action !== 'resume') return error(res, 400, 'invalid');
      const machine = store.state.machines.find(({ id }) => id === command[1]);
      if (!machine || (machine.kind ?? 'klipper') !== 'klipper') return error(res, 404, 'missing');
      if (pendingCommands.has(machine.id)) return error(res, 409, 'command-busy');
      const before = action === 'pause' ? 'printing' : 'paused';
      const after = action === 'pause' ? 'paused' : 'printing';
      pendingCommands.add(machine.id);
      try {
        if ((await readPrinter(machine)).status !== before) return error(res, 409, 'command-state');
        if (res.destroyed) return;
        if (!session(req)) return error(res, 401, 'sign-in');
        try {
          if (!(await sendCommand(machine, action))) return error(res, 502, 'command-rejected');
          for (let attempt = 0; attempt < 4; attempt++) {
            if ((await readPrinter(machine)).status === after) return answer(res, 200, { status: after });
            if (attempt < 3) await delay(350);
          }
        } catch { /* The request may have reached the printer. Never retry it automatically. */ }
        return error(res, 504, 'command-unconfirmed');
      } finally {
        snapshot.forget(machine.id);
        pendingCommands.delete(machine.id);
      }
    }
    if (req.method !== 'POST' || !['/api/setup', '/api/login', '/api/logout', '/api/machines', '/api/machines/test', '/api/machines/edit', '/api/observers'].includes(path)) {
      return error(res, 404, 'missing');
    }
    if (!requireJson(req, res)) return;
    if (path === '/api/logout') {
      if (activeSession) {
        sessions.delete(activeSession);
        stopCameraStreams(activeSession);
      }
      return answer(res, 200, { authenticated: false }, { 'Set-Cookie': cookie('', 0) });
    }
    if (path.startsWith('/api/machines') || path === '/api/observers') {
      if (!viewer) return error(res, 401, 'sign-in');
      if (viewer.role !== 'admin') return error(res, 403, 'forbidden');
    }
    if (path === '/api/setup' && store.state.admin) return error(res, 409, 'installed');
    if ((path === '/api/setup' || path === '/api/login') && !withinLimit(path)) return error(res, 429, 'rate');
    let data;
    try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
    if (path.startsWith('/api/machines')) {
      const existing = store.state.machines.find((machine) => machine.id === data.id);
      if (existing && pendingCommands.has(existing.id)) return error(res, 409, 'command-busy');
      if ((path === '/api/machines/edit' || data.id) && !existing) return error(res, 404, 'missing');
      const name = value(data, 'name', 80).trim();
      const kind = data.kind ?? 'klipper';
      if (existing && kind !== (existing.kind ?? 'klipper')) return error(res, 400, 'machine-invalid');
      let connection;
      if (kind === 'bambu') {
        const host = value(data, 'host', 15).trim();
        const serial = value(data, 'serial', 32).trim().toUpperCase();
        const accessCode = value(data, 'accessCode', 8).trim() || (data.accessCode === '' ? existing?.accessCode ?? '' : '');
        if (privateIPv4(host) && /^[A-Z0-9]{8,32}$/.test(serial) && /^[A-Za-z0-9]{8}$/.test(accessCode)) {
          connection = { origin: `mqtts://${host}:8883`, serial, accessCode };
        }
      } else if (kind === 'elegoo') {
        const host = value(data, 'host', 15).trim();
        const accessCode = value(data, 'accessCode', 64).trim() || (data.accessCode === '' ? existing?.accessCode ?? '' : '');
        if (privateIPv4(host) && /^[!-~]{1,64}$/.test(accessCode)) {
          connection = { origin: `mqtt://${host}:1883`, serial: existing?.serial, accessCode };
        }
      } else if (kind === 'elegoo-cc1') {
        const host = value(data, 'host', 15).trim();
        const serial = existing?.serial ?? value(data, 'serial', 64).trim();
        if (privateIPv4(host) && (!serial || /^[a-zA-Z0-9_-]{6,64}$/.test(serial))) {
          connection = { origin: `ws://${host}:3030`, serial: serial || undefined };
        }
      } else if (kind === 'xtool-m2') {
        const host = value(data, 'host', 15).trim();
        if (privateIPv4(host)) connection = { origin: `wss://${host}:28900`, serial: existing?.serial, fingerprint: existing?.fingerprint };
      } else if (kind === 'klipper') {
        const origin = moonrakerOrigin(value(data, 'origin', 200).trim());
        const apiKey = value(data, 'apiKey', 256).trim() || (data.apiKey === '' ? existing?.apiKey ?? '' : '');
        if (origin && (!data.apiKey || /^[!-~]+$/.test(apiKey))) connection = { origin, apiKey };
      }
      if (!name || !connection) return error(res, 400, 'machine-invalid');
      const machine = { id: existing?.id ?? randomUUID(), name, kind, ...connection };
      const testing = path === '/api/machines/test';
      const elegooReader = kind === 'xtool-m2' ? readXTool : elegooReaders.get(kind);
      if (testing || elegooReader) {
        if (probes >= 2) return error(res, 429, 'probe-busy');
        probes++;
        const abort = new AbortController();
        res.once('close', () => abort.abort());
        try {
          if (testing && kind === 'bambu') return answer(res, 200, await bambu.probe(machine, abort.signal));
          const result = elegooReader ? await elegooReader(machine, { signal: abort.signal }) : await readPrinter(machine);
          if (abort.signal.aborted) return;
          const ok = elegooReader
            ? Boolean(result.serial && (!result.issue || result.issue === 'elegoo-print' || result.issue === 'xtool-device'))
            : !result.issue || result.issue === 'print';
          if (testing) return answer(res, 200, { ok, issue: ok ? null : result.issue });
          if (!ok) return error(res, 422, result.issue ?? 'elegoo-info');
          machine.serial = result.serial;
          if (kind === 'xtool-m2') machine.fingerprint = result.fingerprint;
          if (existing && !store.state.machines.includes(existing)) return error(res, 409, 'machine-changed');
        } finally {
          probes--;
        }
      }
      if (store.state.machines.some((entry) => entry.id !== existing?.id &&
          (entry.origin === machine.origin || (machine.serial && entry.kind === kind && entry.serial === machine.serial)))) {
        return error(res, 409, 'machine-duplicate');
      }
      if (!existing && store.state.machines.length >= 8) return error(res, 409, 'machine-limit');
      const machines = existing ? store.state.machines.map((entry) => entry.id === machine.id ? machine : entry)
        : [...store.state.machines, machine];
      store.save({ ...store.state, machines });
      if (existing) {
        snapshot.forget(machine.id);
        bambu.forget(machine.id);
        for (const [controller, { id }] of cameraStreams) {
          if (id === machine.id) controller.abort();
        }
      }
      return answer(res, existing ? 200 : 201, { id: machine.id });
    }
    const username = value(data, 'username', 40).trim();
    const password = value(data, 'password', 128);
    if (path === '/api/setup') {
      if (!activation || activation.expires <= Date.now()) return error(res, 410, 'expired');
      if (!timingSafeEqual(digest(value(data, 'token', 128).trim()), activation.hash)) return error(res, 403, 'token');
      if (username.length < 3 || password.length < 12) return error(res, 400, 'credentials');
      const salt = randomBytes(16).toString('hex');
      const hash = (await derive(password, salt, 64)).toString('hex');
      if (store.state.admin) return error(res, 409, 'installed');
      if (activation.expires <= Date.now()) return error(res, 410, 'expired');
      store.save({ ...store.state, admin: { username, salt, hash } });
      return signIn(res, username, 'admin');
    }
    const admin = store.state.admin;
    const observers = store.state.observers ?? [];
    if (path === '/api/observers') {
      if (username.length < 3 || password.length < 12) return error(res, 400, 'credentials');
      const salt = randomBytes(16).toString('hex');
      const hash = (await derive(password, salt, 64)).toString('hex');
      const latest = store.state.observers ?? [];
      if (admin.username === username || latest.some((entry) => entry.username === username)) {
        return error(res, 409, 'observer-duplicate');
      }
      if (latest.length >= 16) return error(res, 409, 'observer-limit');
      store.save({ ...store.state, observers: [...latest, { username, salt, hash }] });
      return answer(res, 201, { username });
    }
    if (!admin || !password) return error(res, 401, 'credentials');
    const role = username === admin.username ? 'admin' : 'observer';
    const account = role === 'admin' ? admin : observers.find((entry) => entry.username === username);
    const hash = await derive(password, account?.salt ?? admin.salt, 64);
    if (!account || !timingSafeEqual(hash, Buffer.from(account.hash, 'hex'))) return error(res, 401, 'credentials');
    if (activeSession) {
      sessions.delete(activeSession);
      stopCameraStreams(activeSession);
    }
    return signIn(res, username, role);
  }
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 5_000 }, (req, res) => {
    route(req, res).catch(() => {
      if (!res.headersSent) error(res, 500, 'internal');
      else res.end();
    });
  });
  server.on('close', () => bambu.close());
  return { server, token };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const host = process.env.FABCORE_HOST || '127.0.0.1';
  const port = Number(process.env.FABCORE_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('FABCORE_PORT invalide.');
  const origin = new URL(process.env.FABCORE_ORIGIN || `http://127.0.0.1:${port}`);
  if (origin.protocol !== 'https:' && (
    !['127.0.0.1', '::1'].includes(host) || !['127.0.0.1', '[::1]', 'localhost'].includes(origin.hostname)
  )) throw new Error('Une écoute réseau requiert FABCORE_ORIGIN en HTTPS et un reverse proxy.');
  const { server, token } = createFabCore({ directory: resolve(process.env.FABCORE_DATA || '.fabcore'), origin, oidc: createOidc(origin) });
  server.listen(port, host, () => {
    console.log(`FabCore · ${origin.origin}`);
    if (token) console.log(`Jeton d’activation (15 min, usage unique) : ${token}`);
  });
}
