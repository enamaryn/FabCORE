import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { discoveryNetworks, reconcileDiscovery, scanNetwork } from './discovery.mjs';
import { connectorCatalog, connectorDefinition, createConnectorRegistry } from './connectors.mjs';
import { createMachineLogs } from './machine-logs.mjs';
import { createDiagnostics } from './diagnostics.mjs';
import { cameraRelay } from './camera-viewers.mjs';
import { cameraPreview } from './camera-preview.mjs';
import { createOidc } from './oidc.mjs';
import { internalNtfy, notificationSettings, publicNotifications, sendNotification } from './notifications.mjs';
import { openStore } from './store.mjs';
import { createCloudAccounts, CloudError } from './cloud-accounts.mjs';
import { validateControl } from './manual-controls.mjs';
import { filePath } from './connector-http.mjs';
import { productionPath } from './production-files.mjs';
import { transferMachineFile } from './file-transfer.mjs';

const derive = promisify(scrypt);
const digest = (secret) => createHash('sha256').update(secret).digest();
const sessionAge = 8 * 60 * 60 * 1000;
const activationAge = 15 * 60 * 1000;
const minute = 60_000;
const fileLimit = 512 * 1024 * 1024;
const shared = readFileSync(new URL('../design/prototype.html', import.meta.url), 'utf8');
const sharedScript = shared.match(/<script>([\s\S]+)<\/script>/)[1];
const liveHtml = shared
  .replace('<html lang="fr">', '<html lang="fr" data-live>')
  .replace('href="brand/favicon.svg"', 'href="/favicon.svg"')
  .replace(/<script>[\s\S]+<\/script>/, '<script src="/shared.js"></script><script src="/cloud.js"></script><script src="/live.js"></script>');
const assets = new Map([
  ['/', ['text/html; charset=utf-8', liveHtml]],
  ['/shared.js', ['text/javascript; charset=utf-8', sharedScript]],
  ['/live.js', ['text/javascript; charset=utf-8', `const machineConnectors = ${JSON.stringify(connectorCatalog)};\n` + readFileSync(new URL('./live.js', import.meta.url), 'utf8')]],
  ['/cloud.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./cloud.js', import.meta.url), 'utf8')]],
  ['/gcode.mjs', ['text/javascript; charset=utf-8', readFileSync(new URL('./gcode.mjs', import.meta.url), 'utf8')]],
  ['/favicon.svg', ['image/svg+xml', readFileSync(new URL('../design/brand/favicon.svg', import.meta.url))]]
]);

// Commandes de lecture seule autorisées sans confirmation pendant une impression.
const harmlessCommands = new Set(['M105', 'M114', 'M115', 'M119', 'M27', 'M31', 'M503', 'STATUS', 'HELP', 'GET_POSITION', 'QUERY_ENDSTOPS', 'QUERY_PROBE']);
export const harmlessGcode = (script) => harmlessCommands.has(script.split(/\s+/)[0].toUpperCase());

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
        entry.next = Date.now() + (connectorDefinition(machine.kind ?? 'klipper')?.interval ?? 1000);
        entry.pending = null;
      });
    }
    return { ...entry.current, checkedAt: entry.checkedAt ?? null };
  }
  snapshot.forget = (id) => cache.delete(id);
  return snapshot;
}

export function createFabCore({ directory, origin, readPrinter, readOcto, readPrusa, sendCommand, sendGcode, fetchFiles, readCC2, identifyCC2, readCC1, bambu, activationToken, networks = discoveryNetworks, scan = scanNetwork, openCamera, oidc, cloudFetch, cloudMqtt, notify = sendNotification } = {}) {
  const publicUrl = new URL(origin);
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.href !== publicUrl.origin + '/') {
    throw new Error('FABCORE_ORIGIN doit contenir une origine HTTP ou HTTPS.');
  }
  const secure = publicUrl.protocol === 'https:';
  const allowedHost = publicUrl.host;
  const store = openStore(directory);
  const cloud = createCloudAccounts({ store, directory, fetcher: cloudFetch, connectMqtt: cloudMqtt });
  const token = store.state.admin ? null : (activationToken ?? randomBytes(24).toString('base64url'));
  const activation = token ? { hash: digest(token), expires: Date.now() + activationAge } : null;
  const sessions = new Map();
  const attempts = new Map();
  const machineLogs = createMachineLogs({ directory, machines: () => store.state.machines });
  const diagnostics = createDiagnostics({ journal: machineLogs });
  diagnostics.record('server', 'started');
  const connectors = createConnectorRegistry({ directory: resolve(directory ?? '.fabcore'), readPrinter, readOcto, readPrusa, sendCommand, sendGcode, fetchFiles, readCC2, identifyCC2, readCC1, bambu, diagnostics, openCamera, cloud });
  const snapshot = monitor(async (machine) => {
    const connector = await connectors.get(machine.kind ?? 'klipper');
    const { serial, fingerprint, ...telemetry } = await connector.read(machine);
    return telemetry;
  });
  const pendingCommands = new Set();
  const pendingUploads = new Set();
  const cc2Tests = new WeakMap();
  const xtoolPairings = new Set();
  const terminalUse = new Map();
  let probes = 0;
  let discoveryActive = false;
  const notificationTests = new Set();
  const cameraStreams = new Map();
  const stopCameraStreams = (sessionId) => {
    for (const relay of cameraStreams.values()) {
      for (const [res, viewer] of relay.viewers) {
        if (viewer.owner === sessionId) res.destroy();
      }
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
      cloud.forgetOwner(oldest);
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
            cloud.forgetOwner(activeSession);
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
    const cloudRoute = path.match(/^\/api\/cloud-accounts(?:\/([a-f0-9-]{36})\/(login|verify|devices|disconnect|delete|logs|logs-download|telemetry-start|telemetry-stop|import))?$/);
    if (cloudRoute) {
      if (!viewer) return error(res, 401, 'sign-in');
      if (viewer.role !== 'admin') return error(res, 403, 'forbidden');
      const [, id, action] = cloudRoute;
      try {
        if (req.method === 'GET' && !id) return answer(res, 200, cloud.list());
        if (req.method === 'GET' && ['logs', 'logs-download'].includes(action)) {
          const content = cloud.logs(id);
          if (action === 'logs') return answer(res, 200, { lines: content.trim().split('\n').filter(Boolean).slice(-300).map(line => JSON.parse(line)) });
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="fabcore-cloud-${id}.log"` });
          return res.end(content);
        }
        if (req.method !== 'POST') return error(res, 405, 'missing');
        if (!requireJson(req, res)) return;
        if (!withinLimit('/cloud/' + (id ?? 'new'))) return error(res, 429, 'rate');
        let data;
        try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
        const abort = new AbortController();
        res.once('close', () => { if (!res.writableEnded) abort.abort(); });
        let result;
        if (!id) result = cloud.add(data);
        else if (action === 'login') result = await cloud.login(id, data, activeSession, abort.signal);
        else if (action === 'verify') result = await cloud.verify(id, data, activeSession, abort.signal);
        else if (action === 'telemetry-start' || action === 'telemetry-stop') result = await cloud.telemetry(id, action === 'telemetry-start');
        else if (action === 'import') result = await cloud.importDevice(id, data.serial);
        else if (action === 'devices') result = await cloud.refresh(id, abort.signal);
        else if (action === 'disconnect' || action === 'delete') result = cloud.disconnect(id, action === 'delete');
        else return error(res, 405, 'missing');
        return answer(res, 200, result);
      } catch (failure) {
        return error(res, failure instanceof CloudError ? failure.status : 500, failure instanceof CloudError ? failure.message : 'cloud-storage');
      }
    }
    if (req.method === 'GET' && path === '/api/diagnostics') {
      if (!viewer) return error(res, 401, 'sign-in');
      if (viewer.role !== 'admin') return error(res, 403, 'forbidden');
      return answer(res, 200, {
        ...diagnostics.view(),
        fleet: store.state.machines.map(({ id, name }) => ({ id, name }))
      });
    }
    const machineLogRoute = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/(logs|logs-download)$/);
    if (req.method === 'GET' && machineLogRoute) {
      if (!viewer) return error(res, 401, 'sign-in');
      if (viewer.role !== 'admin') return error(res, 403, 'forbidden');
      const machine = store.state.machines.find(item => item.id === machineLogRoute[1]);
      if (!machine) return error(res, 404, 'missing');
      try {
        const content = machineLogs.read(machine.id);
        if (machineLogRoute[2] === 'logs') return answer(res, 200, { machine: { id: machine.id, name: machine.name, kind: machine.kind, mode: machine.mode ?? 'lan' }, lines: content.trim().split('\n').filter(Boolean).slice(-500).map(line => JSON.parse(line)) });
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="fabcore-machine-${machine.id}.log"` });
        return res.end(content);
      } catch { return error(res, 503, 'logs-unavailable'); }
    }
    const preview = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/camera\/preview(?:\/(side|far|near))?$/);
    const camera = preview ?? path.match(/^\/api\/machines\/([a-f0-9-]{36})\/camera(?:\/(side|far|near))?$/);
    if (req.method === 'GET' && camera) {
      if (!activeSession) return error(res, 401, 'sign-in');
      const machine = store.state.machines.find(({ id }) => id === camera[1]);
      const definition = connectorDefinition(machine?.kind);
      if (!definition?.camera) return error(res, 404, 'camera-unsupported');
      if (camera[2] && machine.kind !== 'xtool-m2') return error(res, 404, 'camera-unsupported');
      const cameraView = machine.kind === 'xtool-m2' ? camera[2] ?? 'side' : undefined;
      const streamKey = cameraView ? machine.id + '/' + cameraView : machine.id;
      if (preview && machine.kind === 'xtool-m2' && !cameraStreams.has(streamKey)) {
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 15_000);
        res.once('close', () => abort.abort());
        try {
          const connector = await connectors.get(machine.kind);
          const image = await connector.preview(machine, abort.signal, cameraView);
          if (abort.signal.aborted) return error(res, 504, 'camera-unavailable');
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          res.end(image);
        } catch {
          if (!res.destroyed) error(res, 502, 'camera-unavailable');
        } finally { clearTimeout(timeout); }
        return;
      }
      const cameraResponse = preview ? cameraPreview(res) : res;
      let relay = cameraStreams.get(streamKey);
      const viewerCount = [...cameraStreams.values()].reduce((count, stream) => count + stream.viewers.size, 0);
      if (viewerCount >= 32 || (!relay && cameraStreams.size >= 8)) return error(res, 429, 'camera-busy');
      if (relay) {
        if (relay.controller.signal.aborted) return error(res, 503, 'camera-unavailable');
        relay.subscribe(cameraResponse, activeSession, viewer.expires);
        return;
      }
      relay = cameraRelay();
      relay.machineId = machine.id;
      cameraStreams.set(streamKey, relay);
      relay.subscribe(cameraResponse, activeSession, viewer.expires);
      const { controller, output } = relay;
      diagnostics.record('camera', 'opening', machine.id);
      let firstFrame = true;
      const onFrame = () => {
        if (firstFrame) diagnostics.record('camera', 'streaming', machine.id);
        firstFrame = false;
        diagnostics.frame(machine.id);
      };
      let failure;
      try {
        const connector = await connectors.get(machine.kind);
        if (!controller.signal.aborted) failure = await connector.camera(machine, output, controller.signal, onFrame, cameraView);
      } catch {
        failure = 'interrupted';
      } finally {
        cameraStreams.delete(streamKey);
        if (failure && !controller.signal.aborted) diagnostics.record('camera', failure, machine.id);
        if (!firstFrame) diagnostics.record('camera', 'closed', machine.id);
        for (const viewerResponse of relay.viewers.keys()) {
          if (controller.signal.aborted || (failure && viewerResponse.headersSent)) viewerResponse.destroy();
          else if (failure) error(viewerResponse, 502, 'camera-unavailable');
          else viewerResponse.end();
        }
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
        const found = await scan(network, abort.signal, { machines: store.state.machines });
        if (abort.signal.aborted) return;
        const devices = reconcileDiscovery(network, found, store.state.machines);
        return answer(res, 200, { devices });
      } finally {
        res.off('close', stop);
        discoveryActive = false;
      }
    }
    if (req.method === 'GET' && path === '/api/machines') {
      if (!activeSession) return error(res, 401, 'sign-in');
      const machines = await Promise.all(store.state.machines.map(async (machine) => {
        const definition = connectorDefinition(machine.kind ?? 'klipper');
        const connector = definition?.live ? await connectors.get(machine.kind) : null;
        if (!store.state.machines.includes(machine)) return null;
        const telemetry = connector ? connector.read(machine) : snapshot(machine);
        diagnostics.status(machine.id, telemetry);
        return {
          id: machine.id, name: machine.name, origin: machine.origin, kind: machine.kind ?? 'klipper', serial: machine.serial,
          model: machine.kind === 'bambu-cloud' ? machine.model : definition?.model ?? connectorCatalog.klipper.model,
          cameraOpen: [...cameraStreams.values()].some(stream => stream.machineId === machine.id && [...stream.viewers.values()].some(({ owner }) => owner === activeSession)),
          ...telemetry
        };
      }));
      return answer(res, 200, { machines: machines.filter(Boolean) });
    }
    const command = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/command$/);
    if (req.method === 'POST' && command) {
      if (!viewer) return error(res, 401, 'sign-in');
      if (viewer.role !== 'admin') return error(res, 403, 'forbidden');
      if (!requireJson(req, res)) return;
      let data;
      try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
      const action = data.action;
      if (!['start', 'pause', 'resume', 'stop'].includes(action)) return error(res, 400, 'invalid');
      const machine = store.state.machines.find(({ id }) => id === command[1]);
      if (!machine || !connectorDefinition(machine.kind ?? 'klipper')?.commands) return error(res, 404, 'missing');
      if (!connectorDefinition(machine.kind ?? 'klipper').commandActions.includes(action)) return error(res, 400, 'command-unsupported');
      if (['stop', 'start'].includes(action) && data.confirm !== true) return error(res, 400, 'invalid');
      if (pendingCommands.has(machine.id) || pendingUploads.has(machine.id)) return error(res, 409, 'command-busy');
      const before = { pause: ['printing'], resume: ['paused'], stop: ['printing', 'paused'], start: ['ready', 'done'] }[action];
      const after = { pause: ['paused'], resume: ['printing'], stop: ['ready', 'done'], start: ['printing'] }[action];
      pendingCommands.add(machine.id);
      try {
        const connector = await connectors.get(machine.kind ?? 'klipper');
        if (!before.includes((await connector.read(machine)).status)) return error(res, 409, 'command-state');
        if (res.destroyed) return;
        if (!session(req)) return error(res, 401, 'sign-in');
        try {
          if (!(await connector.command(machine, action))) return error(res, 502, 'command-rejected');
          for (let attempt = 0; attempt < 4; attempt++) {
            const status = (await connector.read(machine)).status;
            if (after.includes(status)) return answer(res, 200, { status });
            if (attempt < 3) await delay(350);
          }
        } catch { /* The request may have reached the printer. Never retry it automatically. */ }
        return error(res, 504, 'command-unconfirmed');
      } finally {
        snapshot.forget(machine.id);
        pendingCommands.delete(machine.id);
      }
    }
    const controlsRoute = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/controls$/);
    if (controlsRoute && ['GET', 'POST'].includes(req.method)) {
      if (!viewer) return error(res, 401, 'sign-in');
      const machine = store.state.machines.find(entry => entry.id === controlsRoute[1]);
      if (!machine || !connectorDefinition(machine.kind ?? 'klipper')?.controls) return error(res, 404, 'missing');
      if (req.method === 'POST' && viewer.role !== 'admin') return error(res, 403, 'forbidden');
      if (req.method === 'POST' && !requireJson(req, res)) return;
      let data;
      if (req.method === 'POST') { try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); } }
      if (req.method === 'POST' && (pendingCommands.has(machine.id) || pendingUploads.has(machine.id))) return error(res, 409, 'command-busy');
      if (req.method === 'POST') {
        const now = Date.now(), key = 'controls:' + machine.id;
        const recent = (terminalUse.get(key) ?? []).filter(at => now - at < minute);
        if (recent.length >= 30 || (recent.length && now - recent.at(-1) < 500)) return error(res, 429, 'rate');
        terminalUse.set(key, [...recent, now]);
        pendingCommands.add(machine.id);
      }
      let attempted = false;
      try {
        const connector = await connectors.get(machine.kind ?? 'klipper');
        const status = (await connector.read(machine)).status;
        if (req.method === 'POST' && !['ready', 'done', 'printing', 'paused'].includes(status)) return error(res, 409, 'command-state');
        const controls = await connector.control.read(machine);
        if (req.method === 'GET') return answer(res, 200, { ...controls, status });
        const command = validateControl(data, controls);
        if (!command) return error(res, 400, 'control-invalid');
        if (['move', 'home'].includes(command.action) && !['ready', 'done'].includes(status)) return error(res, 409, 'command-state');
        if (['printing', 'paused'].includes(status) && ['heat', 'fan'].includes(command.action) && data.duringPrint !== true) return error(res, 409, 'control-confirm');
        if (res.destroyed) return;
        if (!session(req)) return error(res, 401, 'sign-in');
        attempted = true;
        const result = await connector.control.execute(machine, command, controls);
        diagnostics.record('controls', result.outcome, machine.id);
        return answer(res, result.outcome === 'rejected' ? 502 : 200, result.outcome === 'rejected' ? { error: 'command-rejected' } : result);
      } catch (failure) {
        const heaterUnconfirmed = attempted && failure.message === 'heater-unconfirmed';
        diagnostics.record('controls', !attempted ? 'request-failed' : heaterUnconfirmed ? 'heater-unconfirmed' : failure.message === 'command-rejected' ? 'rejected' : 'unconfirmed', machine.id);
        return error(res, !attempted || failure.message === 'command-rejected' ? 502 : 504, !attempted ? 'controls-unavailable' : heaterUnconfirmed ? 'heater-unconfirmed' : failure.message === 'command-rejected' ? 'command-rejected' : 'command-unconfirmed');
      } finally { if (req.method === 'POST') pendingCommands.delete(machine.id); }
    }
    const terminal = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/gcode$/);
    if (req.method === 'POST' && terminal) {
      if (!viewer) return error(res, 401, 'sign-in');
      if (viewer.role !== 'admin') return error(res, 403, 'forbidden');
      if (!requireJson(req, res)) return;
      let data;
      try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
      const script = typeof data.command === 'string' ? data.command.trim() : '';
      if (!/^[\x20-\x7E]{1,256}$/.test(script)) return error(res, 400, 'invalid');
      const machine = store.state.machines.find(({ id }) => id === terminal[1]);
      if (!machine || !connectorDefinition(machine.kind ?? 'klipper')?.terminal) return error(res, 404, 'missing');
      if (pendingCommands.has(machine.id)) return error(res, 409, 'command-busy');
      const now = Date.now();
      const use = terminalUse.get(machine.id);
      const recent = (use ?? []).filter(time => now - time < minute);
      if (recent.length >= 30 || (recent.length && now - recent.at(-1) < 500)) return error(res, 429, 'rate');
      terminalUse.set(machine.id, [...recent, now]);
      pendingCommands.add(machine.id);
      try {
        const connector = await connectors.get(machine.kind ?? 'klipper');
        const { status } = await connector.read(machine);
        if (status === 'offline') return error(res, 409, 'terminal-offline');
        if ((status === 'printing' || status === 'paused') && !harmlessGcode(script) && data.confirm !== true) {
          return error(res, 409, 'terminal-confirm');
        }
        if (res.destroyed) return;
        if (!session(req)) return error(res, 401, 'sign-in');
        try {
          const result = await connector.gcode(machine, script);
          diagnostics.record('terminal', result.outcome, machine.id);
          return answer(res, 200, result);
        } catch {
          /* La commande a pu atteindre la machine : ne jamais la renvoyer automatiquement. */
          diagnostics.record('terminal', 'unconfirmed', machine.id);
          return error(res, 504, 'command-unconfirmed');
        }
      } finally {
        pendingCommands.delete(machine.id);
      }
    }
    const fileRoute = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/(files|file|print|transfer)(?:\?(.*))?$/);
    if (fileRoute) {
      if (!viewer) return error(res, 401, 'sign-in');
      const [, id, route, query = ''] = fileRoute;
      const machine = store.state.machines.find(entry => entry.id === id);
      if (!machine || !connectorDefinition(machine.kind ?? 'klipper')?.files) return error(res, 404, 'missing');
      const files = (await connectors.get(machine.kind ?? 'klipper')).files;
      const validPath = connectorDefinition(machine.kind ?? 'klipper').projects ? productionPath : filePath;
      const params = new URLSearchParams(query);
      if (req.method === 'GET' && route === 'files') {
        try {
          const list = await files.list(machine);
          return answer(res, 200, { files: list.sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0)).slice(0, 300), ...(list.length > 300 ? { truncated: true } : {}) });
        } catch { return error(res, 502, 'files-unavailable'); }
      }
      if (req.method === 'GET' && route === 'file') {
        const target = validPath(params.get('path'));
        if (!target) return error(res, 400, 'invalid');
        const controller = new AbortController();
        res.once('close', () => controller.abort());
        let response;
        const download = params.get('download') === '1' ? files.downloadOriginal ?? files.download : files.download;
        try { response = await download.call(files, machine, target, controller.signal); } catch (failure) {
          return error(res, 502, ['project-multiple-plates', 'project-no-gcode', 'project-format'].includes(failure.message) ? failure.message : 'files-unavailable');
        }
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          return response.status === 404 ? error(res, 404, 'missing') : error(res, 502, 'files-unavailable');
        }
        const length = Number(response.headers.get('content-length'));
        if (length > fileLimit) {
          await response.body.cancel();
          return error(res, 413, 'file-too-large');
        }
        const attachment = params.get('download') === '1';
        const filename = target.split('/').at(-1);
        res.writeHead(200, { 'Content-Type': attachment ? 'application/octet-stream' : 'text/plain; charset=utf-8',
          ...(attachment ? { 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(filename).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase()), 'Cache-Control': 'no-store' } : {}), ...(length > 0 ? { 'Content-Length': String(length) } : {}) });
        let sent = 0;
        try {
          for await (const chunk of response.body) {
            sent += chunk.length;
            if (sent > fileLimit) throw new Error('file too large');
            if (!res.write(chunk)) await once(res, 'drain');
          }
          return res.end();
        } catch { return res.destroy(); }
      }
      if (viewer.role !== 'admin') return error(res, 403, 'forbidden');
      if (req.headers.origin !== publicUrl.origin) return error(res, 403, 'origin');
      if (req.method === 'POST' && route === 'transfer') {
        if (!requireJson(req, res)) return;
        let data;
        try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
        const sourcePath = validPath(data.path);
        const destination = store.state.machines.find(entry => entry.id === data.destination);
        const definition = destination && connectorDefinition(destination.kind ?? 'klipper');
        const destinationPath = definition?.projects ? productionPath : filePath;
        const name = data.name;
        if (!sourcePath || data.confirm !== true || !destination || destination.id === machine.id || !definition?.files ||
          !destinationPath(name) || name.includes('/') || /\.3mf$/i.test(sourcePath) !== /\.3mf$/i.test(name)) return error(res, 400, 'invalid');
        if ([machine.id, destination.id].some(id => pendingUploads.has(id) || pendingCommands.has(id))) return error(res, 409, 'upload-busy');
        pendingUploads.add(machine.id);
        pendingUploads.add(destination.id);
        const controller = new AbortController();
        res.once('close', () => controller.abort());
        try {
          const targetFiles = (await connectors.get(destination.kind ?? 'klipper')).files;
          if ((await targetFiles.list(destination)).some(entry => entry.path === name)) return error(res, 409, 'file-exists');
          const stored = await transferMachineFile({ machine, files }, { machine: destination, files: targetFiles }, sourcePath, name, controller.signal);
          diagnostics.record('files', 'transferred', destination.id);
          return answer(res, 201, { path: stored, destination: destination.id });
        } catch (failure) {
          const known = ['file-too-large', 'missing', 'files-unavailable', 'file-exists', 'file-quota', 'project-format', 'project-multiple-plates', 'project-no-gcode'];
          return error(res, failure.message === 'file-exists' ? 409 : failure.message === 'file-too-large' ? 413 : failure.message === 'missing' ? 404 : 502,
            known.includes(failure.message) ? failure.message : 'upload-failed');
        } finally {
          pendingUploads.delete(machine.id);
          pendingUploads.delete(destination.id);
        }
      }
      if (req.method === 'POST' && route === 'files') {
        const name = params.get('name');
        const size = Number(req.headers['content-length']);
        if (req.headers['content-type'] !== 'application/octet-stream' || !validPath(name) || name.includes('/')) return error(res, 400, 'invalid');
        if (!Number.isSafeInteger(size) || size < 1) return error(res, 411, 'invalid');
        if (size > fileLimit) return error(res, 413, 'file-too-large');
        if (pendingUploads.has(machine.id) || pendingCommands.has(machine.id)) return error(res, 409, 'upload-busy');
        pendingUploads.add(machine.id);
        try {
          const stored = await files.upload(machine, name, req, size);
          if (!stored) return error(res, 502, 'upload-rejected');
          diagnostics.record('files', 'uploaded', machine.id);
          return answer(res, 201, { path: stored });
        } catch (failure) {
          if (!res.headersSent) return error(res, 502, ['project-multiple-plates', 'project-no-gcode', 'project-format', 'file-exists', 'file-quota'].includes(failure.message) ? failure.message : 'upload-failed');
          return res.destroy();
        } finally {
          pendingUploads.delete(machine.id);
        }
      }
      if (req.method === 'POST' && route === 'print') {
        if (!requireJson(req, res)) return;
        let data;
        try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
        const target = validPath(data.path);
        if (!target || data.confirm !== true) return error(res, 400, 'invalid');
        if (connectorDefinition(machine.kind ?? 'klipper').externalFilament && data.filamentMode !== 'external') return error(res, 400, 'filament-confirm');
        if (pendingCommands.has(machine.id) || pendingUploads.has(machine.id)) return error(res, 409, 'command-busy');
        pendingCommands.add(machine.id);
        try {
          const connector = await connectors.get(machine.kind ?? 'klipper');
          if (!['ready', 'done'].includes((await connector.read(machine)).status)) return error(res, 409, 'command-state');
          if (res.destroyed) return;
          if (!session(req)) return error(res, 401, 'sign-in');
          try {
            if (!(await files.start(machine, target))) return error(res, 502, 'command-rejected');
            diagnostics.record('files', 'print-started', machine.id);
            for (let attempt = 0; attempt < 6; attempt++) {
              if ((await connector.read(machine)).status === 'printing') return answer(res, 200, { status: 'printing' });
              if (attempt < 5) await delay(500);
            }
          } catch (failure) {
            if (['project-format', 'project-no-gcode', 'project-multiple-plates'].includes(failure.message)) return error(res, 400, failure.message);
            /* La demande a pu atteindre la machine : ne jamais la renvoyer automatiquement. */
          }
          return error(res, 504, 'command-unconfirmed');
        } finally {
          snapshot.forget(machine.id);
          pendingCommands.delete(machine.id);
        }
      }
      return error(res, 404, 'missing');
    }
    if (req.method !== 'POST' || !['/api/setup', '/api/login', '/api/logout', '/api/machines', '/api/machines/test', '/api/machines/pair', '/api/machines/edit', '/api/machines/delete', '/api/observers'].includes(path)) {
      return error(res, 404, 'missing');
    }
    if (!requireJson(req, res)) return;
    if (path === '/api/logout') {
      if (activeSession) {
        sessions.delete(activeSession);
        stopCameraStreams(activeSession);
        cloud.forgetOwner(activeSession);
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
      if (path === '/api/machines/delete') {
        if (!existing) return error(res, 404, 'missing');
        const machines = store.state.machines.filter((machine) => machine !== existing);
        store.save({ ...store.state, machines });
        snapshot.forget(existing.id);
        machineLogs.forget(existing.id);
        connectors.forget(existing.kind ?? 'klipper', existing.id, true);
        for (const stream of cameraStreams.values()) {
          if (stream.machineId === existing.id) stream.controller.abort();
        }
        return answer(res, 200, { id: existing.id });
      }
      if ((path === '/api/machines/edit' || data.id) && !existing) return error(res, 404, 'missing');
      const name = value(data, 'name', 80).trim();
      const kind = data.kind ?? 'klipper';
      if (existing && kind !== (existing.kind ?? 'klipper')) return error(res, 400, 'machine-invalid');
      const definition = connectorDefinition(kind);
      const connection = definition?.configure(data, existing);
      if (!name || !connection) return error(res, 400, 'machine-invalid');
      const machine = { id: existing?.id ?? randomUUID(), name, kind, ...connection };
      if (kind === 'bambu' && store.state.machines.some(item => item.id !== machine.id && ['bambu', 'bambu-cloud'].includes(item.kind) && item.serial === machine.serial)) return error(res, 409, 'cloud-machine-exists');
      const testing = path === '/api/machines/test';
      const pairing = path === '/api/machines/pair';
      if (pairing) {
        if (kind !== 'xtool-m2') return error(res, 400, 'machine-invalid');
        if (xtoolPairings.has(machine.origin)) return error(res, 409, 'xtool-pairing-busy');
        if (store.state.machines.some(entry => entry.origin === machine.origin && entry.id !== existing?.id)) {
          return error(res, 409, 'machine-duplicate');
        }
        if (!existing && store.state.machines.length >= 8) return error(res, 409, 'machine-limit');
      }
      const cc2TestKey = kind === 'elegoo' && !existing
        ? digest(JSON.stringify([machine.origin, machine.accessCode])).toString('hex')
        : null;
      const previousTest = cc2Tests.get(viewer);
      const verifiedCC2 = !testing && cc2TestKey && previousTest?.key === cc2TestKey && previousTest.expires > Date.now();
      if (verifiedCC2) {
        machine.serial = previousTest.serial;
      } else if (testing || definition.verify) {
        if (probes >= 2) return error(res, 429, 'probe-busy');
        probes++;
        if (pairing) xtoolPairings.add(machine.origin);
        const abort = new AbortController();
        res.once('close', () => abort.abort());
        try {
          const connector = await connectors.get(kind);
          if (abort.signal.aborted) return;
          const sameConnection = existing && existing.origin === machine.origin && existing.accessCode === machine.accessCode;
          const result = await connector.probe(machine, { signal: abort.signal, testing, sameConnection, pairing });
          if (abort.signal.aborted) return;
          if (pairing && !session(req)) return error(res, 401, 'sign-in');
          if (testing) {
            if (cc2TestKey) {
              cc2Tests.delete(viewer);
              if (result.ok && result.serial) {
                cc2Tests.set(viewer, { key: cc2TestKey, serial: result.serial, expires: Date.now() + 60_000 });
              }
            }
            return answer(res, 200, {
              ok: result.ok,
              issue: result.issue ?? (result.ok ? null : 'elegoo-report'),
              ...(result.ok && result.serial ? { serial: result.serial } : {})
            });
          }
          if (!result.ok) return error(res, 422, result.issue ?? 'elegoo-info');
          machine.serial = result.serial;
          if (result.fingerprint) machine.fingerprint = result.fingerprint;
          if (pairing && result.pairingToken) machine.pairingToken = result.pairingToken;
          if (existing && !store.state.machines.includes(existing)) return error(res, 409, 'machine-changed');
        } finally {
          probes--;
          if (pairing) xtoolPairings.delete(machine.origin);
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
      if (verifiedCC2) cc2Tests.delete(viewer);
      if (existing) {
        snapshot.forget(machine.id);
        connectors.forget(kind, machine.id, existing.origin !== machine.origin || existing.accessCode !== machine.accessCode);
        for (const stream of cameraStreams.values()) {
          if (stream.machineId === machine.id) stream.controller.abort();
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
      diagnostics.record('server', 'request-failed');
      if (!res.headersSent) error(res, 500, 'internal');
      else res.end();
    });
  });
  server.on('close', () => { connectors.close(); cloud.close(); });
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
