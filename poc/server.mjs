import { createMoonrakerConfig, configPath, configLimit } from '../connectors/moonraker/src/config.ts';
import { createMoonrakerTramming, storedTramming, trammingResult } from '../connectors/moonraker/src/tramming.ts';
import { encodePath, moonrakerOrigin, multipart, readResponse as readMoonrakerResponse } from './connector-http.mjs';
import { createProjectService } from '../src/application/projects.ts';
import { bambuCameraInfo } from '../src/domain/camera.ts';
import { manualSpool, supportsManualSpool } from './manual-spool.mjs';
import { createServer } from 'node:http';
import { createHttpApp } from '../src/http/app.ts';
import { currentRequestId } from '../src/http/correlation.ts';
import { HttpError } from '../src/http/errors.ts';
import { migratedRoutes } from '../src/http/routes/index.ts';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readWebAssets } from '../src/http/web-build.ts';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { discoveryNetworks, reconcileDiscovery, scanNetwork } from './discovery.mjs';
import { connectorCatalog, connectorDefinition, createConnectorRegistry } from './connectors.mjs';
import { createMachineLogs } from './machine-logs.mjs';
import { createDiagnostics } from './diagnostics.mjs';
import { cameraRelay } from './camera-viewers.mjs';
import { cameraPreview } from './camera-preview.mjs';
import { createOidc } from './oidc.mjs';
import { internalNtfy, sendNotification } from './notifications.mjs';
import { createAccountService } from '../src/application/accounts.ts';
import { createMachineMetadata } from '../src/application/machines.ts';
import { createNotificationService } from '../src/application/notifications.ts';
import { createPersist } from '../src/application/state-store.ts';
import { createEventHub } from '../src/application/events.ts';
import { createVersionService } from '../src/application/version.ts';
import { createFleetWatcher, observeFleet } from '../src/application/fleet-events.ts';
import { openStore } from './store.mjs';
import { createCloudAccounts, CloudError } from './cloud-accounts.mjs';
import { createBambuLanResolver } from './bambu-lan-resolver.mjs';
import { createBambuCredentialRenewal } from './bambu-credential-renewal.mjs';
import { createBambuSigner } from './bambu-signing.mjs';
import { createBambuCertificateVault } from './bambu-certificate-vault.mjs';
import { validateControl } from './manual-controls.mjs';
import { ray5Path } from './longer-ray5-files.mjs';
import { filePath } from './connector-http.mjs';
import { productionPath } from './production-files.mjs';
import { transferMachineFile } from './file-transfer.mjs';

import { digest } from '../src/application/accounts.ts';
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
let reactAssets;
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

async function readJson(req, maxBytes = 4096) {
  let size = 0;
  const parts = [];
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBytes) {
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
        (error) => {
          // Machine remplacée pendant le chargement (édition, bobine) : garder le dernier état plutôt qu'un faux hors ligne.
          if (error?.message !== 'machine-removed') entry.current = { status: 'offline', issue: 'connection', progress: 0, nozzle: null, bed: null, file: '' };
        }
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

export function createFabCore({ directory, store: storage = openStore(directory), origin, readPrinter, readOcto, readPrusa, sendCommand, sendGcode, fetchFiles, readCC2, identifyCC2, readCC1, bambu, ray5, activationToken, networks = discoveryNetworks, scan = scanNetwork, openCamera, oidc, cloudFetch, cloudMqtt, certificateFetch, resolveBambuHost, notify = sendNotification, logLevel = 'debug', eventHeartbeatMs = 15_000, versionFetch, cloudCameraStream, experimentalCloudCamera = process.env.FABCORE_EXPERIMENTAL_BAMBU_CAMERA !== '0' } = {}) {
  const publicUrl = new URL(origin);
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.href !== publicUrl.origin + '/') {
    throw new Error('FABCORE_ORIGIN doit contenir une origine HTTP ou HTTPS.');
  }
  const secure = publicUrl.protocol === 'https:';
  const allowedHost = publicUrl.host;
  // Événements SSE (MIG-05) : bus borné ; le magasin observé publie fleet.changed après chaque écriture durable.
  const events = createEventHub();
  const store = observeFleet(storage, events);
  // Écriture attendue avant toute réponse ; base indisponible : 503, état précédent conservé (PostgreSQL, MIG-04).
  const persist = createPersist(store);
  const bambuCertificates = createBambuCertificateVault(directory);
  const credentialRenewal = createBambuCredentialRenewal({ vault: bambuCertificates, directory, fetcher: certificateFetch,
    notify: async kind => {
      const options = { title: 'FabCore - Bambu', message: kind === 'expiry' ? 'Les certificats Bambu approchent de leur échéance. Renseignez une URL de renouvellement ou réimportez les fichiers PEM dans FabCore.' : 'Le renouvellement des certificats Bambu a échoué. Les fichiers précédents sont conservés. Consultez Comptes cloud dans FabCore.' };
      const results = await Promise.allSettled(['ntfy', 'smtp'].map(channel => notify(channel, store.state.notifications ?? {}, internalNtfy(directory), options)));
      return results.some(result => result.status === 'fulfilled' && result.value === true);
    } });
  const bambuLan = createBambuLanResolver({ networks });
  const cloud = createCloudAccounts({ store, directory, fetcher: cloudFetch, connectMqtt: cloudMqtt, context: currentRequestId, locateBambuHost: resolveBambuHost ?? ((serial, signal) => bambuLan.resolve(serial, signal)),
    createSigner: () => { const material = bambuCertificates.load(); return material ? createBambuSigner(material) : null; } });
  const token = store.state.admin ? null : (activationToken ?? randomBytes(24).toString('base64url'));
  const activation = token ? { hash: digest(token), expires: Date.now() + activationAge } : null;
  // Cas d'usage migrés en TypeScript (MIG-04) : comptes, notifications, bobine manuelle.
  const accountService = createAccountService({ store, persist, activation });
  const metadata = createMachineMetadata({ store, persist });
  const sessions = new Map();
  const attempts = new Map();
  const machineLogs = createMachineLogs({ directory, machines: () => store.state.machines, context: currentRequestId, minLevel: logLevel });
  const diagnostics = createDiagnostics({ journal: machineLogs, context: currentRequestId });
  diagnostics.record('server', 'started');
  const connectors = createConnectorRegistry({ isCurrent: machine => store.state.machines.includes(machine), directory: resolve(directory ?? '.fabcore'), readPrinter, readOcto, readPrusa, sendCommand, sendGcode, fetchFiles, readCC2, identifyCC2, readCC1, bambu, ray5, diagnostics, openCamera, cloud, experimentalCloudCamera, cloudCameraStream });
  const snapshot = monitor(async (machine) => {
    const { serial, fingerprint, ...telemetry } = await connectors.read(machine.kind ?? 'klipper', machine);
    return telemetry;
  });
  const klipperConfig = createMoonrakerConfig({ encodePath, validOrigin: moonrakerOrigin, multipart, readResponse: readMoonrakerResponse }, fetchFiles ?? fetch);
  const tramming = createMoonrakerTramming({ validOrigin: moonrakerOrigin, readResponse: readMoonrakerResponse }, fetchFiles ?? fetch);
  const trammingCycles = new Map();
  const pendingCommands = new Set();
  const pendingEmergencies = new Set();
  const emergencyGenerations = new Map();
  const pendingUploads = new Set();
  const cc2Tests = new WeakMap();
  const xtoolPairings = new Set();
  const terminalUse = new Map();
  let probes = 0;
  let discoveryActive = false;
  const cameraStreams = new Map();
  const stopCameraStreams = (sessionId) => {
    // Session révoquée (déconnexion, nouvelle connexion, éviction) : ses flux d'événements sont fermés aussi.
    events.close(subscriber => subscriber.session === sessionId);
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
  // Gestionnaires HTTP bruts, branchés par src/http/routes/operations.ts et pages.ts derrière les gardes du socle.
  // Pages et scripts de l'interface : chemin exact, liens directs contrôlés vers les écrans conservés pendant MIG-06.
  async function handleAsset(req, res) {
    const path = req.url;
    if (path === '/app' || path === '/app/' || /^\/app\/assets\/[A-Za-z0-9_.-]+\.(js|css)$/.test(path)) {
      let assets;
      try { assets = await (reactAssets ??= readWebAssets({ fallback: join(resolve(directory ?? '.fabcore'), 'web-dist') })); }
      catch (failure) {
        // Compilation impossible : cause dans le journal du service, page explicite, nouvel essai à la prochaine visite.
        reactAssets = null;
        console.error(`FabCore · interface /app indisponible : ${failure?.code ?? ''} ${String(failure?.message ?? failure).split('\n')[0]}`.trim());
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '60' });
        return res.end('<!doctype html><meta charset="utf-8"><title>FabCore</title><p>La nouvelle interface n’a pas pu être préparée (voir <code>journalctl -u fabcore</code>). Lancer <code>npm run build:web</code> dans le dossier de FabCore puis réessayer. <a href="/">Interface actuelle</a></p>');
      }
      const asset = assets.get(path);
      if (!asset) return error(res, 404, 'missing');
      res.writeHead(200, { 'Content-Type': asset.type });
      return res.end(asset.body);
    }
    const url = new URL(path, publicUrl);
    const keys = [...url.searchParams.keys()];
    const machineLink = /^[a-f0-9-]{36}$/.test(url.searchParams.get('machine') ?? '') &&
      (keys.length === 1 || (keys.length === 2 && keys.includes('tab') && ['files', 'logs', 'console', 'settings', 'config'].includes(url.searchParams.get('tab'))) ||
        ((keys.length === 2 || (keys.length === 3 && keys.includes('follow') && url.searchParams.get('follow') === '1')) && keys.includes('view') && Boolean(productionPath(url.searchParams.get('view')) || ray5Path(url.searchParams.get('view')))));
    const deepLink = url.pathname === '/' && (machineLink || (keys.length === 1 &&
      ['cloud', 'diagnostics', 'notifications', 'observer', 'add'].includes(url.searchParams.get('screen'))));
    // One fleet/cockpit UI. Keep only unmigrated administration and console on the legacy shell.
    let destination = path === '/' ? '/app' : path === '/?auth=oidc-failed' ? '/app#oidc-failed' : null;
    if (deepLink && machineLink && url.searchParams.get('tab') !== 'console') {
      destination = '/app#machine/' + url.searchParams.get('machine');
      if (url.searchParams.has('view')) destination += '/view/' + encodeURIComponent(url.searchParams.get('view')) + (url.searchParams.get('follow') === '1' ? '/follow' : '');
      else if (url.searchParams.has('tab')) destination += '/' + url.searchParams.get('tab');
    }
    if (deepLink && !machineLink) destination = { diagnostics: '/app#diagnostics', notifications: '/app#notifications', observer: '/app#access', add: '/app#machines/add' }[url.searchParams.get('screen')] ?? null;
    if (destination) { res.writeHead(303, { Location: destination }); return res.end(); }
    const asset = deepLink ? '/' : path;
    if (req.method === 'GET' && assets.has(asset)) {
      const [type, body] = assets.get(asset);
      res.writeHead(200, { 'Content-Type': type });
      return res.end(body);
    }
    return error(res, 404, 'missing');
  }

  async function handleOidc(req, res) {
    const path = req.url;
    const activeSession = session(req);
    const viewer = sessions.get(activeSession);
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
    return redirect('/app#oidc-failed', oidc.clearCookie);
  }

  async function handleBambuCertificates(req, res) {
    if (req.method === 'GET') {
      try { return answer(res, 200, { ...bambuCertificates.status(), renewal: credentialRenewal.status() }); }
      catch { return error(res, 503, 'bambu-cert-storage'); }
    }
    if (req.method !== 'POST') return error(res, 405, 'missing');
    if (!requireJson(req, res)) return;
    if (!withinLimit('/bambu-certificates')) return error(res, 429, 'rate');
    let data;
    try { data = await readJson(req, 160 * 1024); }
    catch { return error(res, 400, 'bambu-cert-invalid'); }
    try {
      if (data?.action === 'refresh') {
        const renewal = await credentialRenewal.run({ force: true });
        return renewal.state === 'failed' ? error(res, 502, 'bambu-cert-refresh-failed') : answer(res, 200, { ...bambuCertificates.status(), renewal });
      }
      if (data?.action === 'configure') return answer(res, 200, bambuCertificates.setRefreshUrl(data.refreshUrl));
      return answer(res, 200, bambuCertificates.install(data));
    }
    catch (failure) { return error(res, failure.status ?? 503, failure.status === 400 && /^bambu-cert-[a-z-]+$/.test(failure.message) ? failure.message : 'bambu-cert-storage'); }
  }

  async function handleCloudAction(req, res) {
    const path = req.url;
    const activeSession = session(req);
    const viewer = sessions.get(activeSession);
    const cloudRoute = path.match(/^\/api\/cloud-accounts(?:\/([a-f0-9-]{36})\/(login|verify|devices|disconnect|delete|logs|logs-download|telemetry-start|telemetry-stop|import))?$/);
    const [, id, action] = cloudRoute;
    try {
      // Lectures (liste et journaux) servies par src/http/routes/logs.ts.
      if (req.method !== 'POST') return error(res, 405, 'missing');
      if (!requireJson(req, res)) return;
      if (!withinLimit('/cloud/' + (id ?? 'new'))) return error(res, 429, 'rate');
      let data;
      try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
      const abort = new AbortController();
      res.once('close', () => { if (!res.writableEnded) abort.abort(); });
      let result;
      if (!id) result = await cloud.add(data);
      else if (action === 'login') result = await cloud.login(id, data, activeSession, abort.signal);
      else if (action === 'verify') result = await cloud.verify(id, data, activeSession, abort.signal);
      else if (action === 'telemetry-start' || action === 'telemetry-stop') result = await cloud.telemetry(id, action === 'telemetry-start');
      else if (action === 'import') result = await cloud.importDevice(id, data.serial);
      else if (action === 'devices') result = await cloud.refresh(id, abort.signal);
      else if (action === 'disconnect' || action === 'delete') result = await cloud.disconnect(id, action === 'delete');
      else return error(res, 405, 'missing');
      return answer(res, 200, result);
    } catch (failure) {
      return error(res, failure instanceof CloudError ? failure.status : 500, failure instanceof CloudError ? failure.message : 'cloud-storage');
    }
  }

  async function handleCamera(req, res) {
    const path = req.url;
    const activeSession = session(req);
    const viewer = sessions.get(activeSession);
    const preview = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/camera\/preview(?:\/(side|far|near))?$/);
    const camera = preview ?? path.match(/^\/api\/machines\/([a-f0-9-]{36})\/camera(?:\/(side|far|near))?$/);
    const machine = store.state.machines.find(({ id }) => id === camera[1]);
    const definition = connectorDefinition(machine?.kind);
    if (!definition?.camera) return error(res, 404, 'camera-unsupported');
    if (machine.kind === 'bambu-cloud') { const info = bambuCameraInfo(machine.camera, experimentalCloudCamera); if (!info.available) return error(res, 503, info.issue); }
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

  async function handleKlipperConfig(req, res) {
    const url = new URL(req.url, origin);
    const match = url.pathname.match(/^\/api\/machines\/([a-f0-9-]{36})\/(klipper-config|klipper-restart|klipper-firmware-restart|moonraker-restart)$/);
    const machine = store.state.machines.find(item => item.id === match?.[1]);
    if (!machine || (machine.kind ?? 'klipper') !== 'klipper') return error(res, 404, 'missing');
    if (req.method === 'GET') {
      try {
        const path = url.searchParams.get('path');
        if (path && !configPath(path)) return error(res, 400, 'config-invalid');
        if (path && url.searchParams.get('download') === '1') {
          const file = await klipperConfig.read(machine, path); res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + path.split('/').at(-1) + '"' }); res.end(file.content); return;
        }
        return answer(res, 200, path ? await klipperConfig.read(machine, path) : { files: await klipperConfig.list(machine) });
      } catch (failure) { return error(res, failure.message === 'config-missing' ? 404 : 502, /^config-/.test(failure.message) ? failure.message : 'config-unavailable'); }
    }
    if (!requireJson(req, res)) return;
    if (!withinLimit('klipper-config:' + machine.id)) return error(res, 429, 'rate');
    let data; try { data = await readJson(req, configLimit * 6 + 4096); } catch { return error(res, 400, 'config-invalid'); }
    if (pendingCommands.has(machine.id) || pendingUploads.has(machine.id) || pendingEmergencies.has(machine.id)) return error(res, 409, 'command-busy');
    if (data.confirm !== true) return error(res, 400, 'config-confirm');
    const emergencyGeneration = emergencyGenerations.get(machine.id) ?? 0;
    pendingCommands.add(machine.id);
    const canWrite = () => !res.destroyed && sessions.get(session(req))?.role === 'admin' && store.state.machines.includes(machine) && !pendingEmergencies.has(machine.id) && (emergencyGenerations.get(machine.id) ?? 0) === emergencyGeneration;
    try {
      const result = match[2] === 'moonraker-restart' ? await klipperConfig.restartMoonraker(machine, canWrite) : match[2] === 'klipper-firmware-restart' ? await klipperConfig.firmwareRestart(machine, canWrite) : match[2] === 'klipper-restart' ? await klipperConfig.restart(machine, canWrite) : await klipperConfig.save(machine, data.path, data.content, data.expectedRevision, canWrite);
      snapshot.forget(machine.id);
      return answer(res, 200, result);
    } catch (failure) {
      const code = /^config-|^command-busy$/.test(failure.message) ? failure.message : 'config-unavailable';
      return error(res, ['config-conflict', 'config-state', 'command-busy'].includes(code) ? 409 : ['config-invalid', 'config-confirm'].includes(code) ? 400 : 502, code);
    } finally { pendingCommands.delete(machine.id); }
  }

  // Nivellement 4 points : GET géométrie + dernier résultat ; POST { point: 0..3, confirm } palpe un point.
  // Le 4e point clôt la passe : buse remontée, planéité enregistrée sur la machine. Un point = un envoi, jamais rejoué.
  async function handleTramming(req, res) {
    const match = new URL(req.url, origin).pathname.match(/^\/api\/machines\/([a-f0-9-]{36})\/tramming$/);
    const machine = store.state.machines.find(item => item.id === match?.[1]);
    if (!machine || (machine.kind ?? 'klipper') !== 'klipper') return error(res, 404, 'missing');
    if (req.method === 'GET') {
      try {
        const { available, reason, offset, points } = await tramming.geometry(machine);
        return answer(res, 200, { available, ...(reason ? { reason } : {}), ...(offset ? { offset, points } : {}), last: storedTramming(machine.bedLevel) });
      } catch { return error(res, 502, 'tramming-unavailable'); }
    }
    if (!requireJson(req, res)) return;
    if (!withinLimit('tramming:' + machine.id)) return error(res, 429, 'rate');
    let data; try { data = await readJson(req); } catch { return error(res, 400, 'tramming-invalid'); }
    const index = data.point;
    if (data.confirm !== true || !Number.isInteger(index) || index < 0 || index > 3) return error(res, 400, 'tramming-invalid');
    if (pendingCommands.has(machine.id) || pendingUploads.has(machine.id) || pendingEmergencies.has(machine.id)) return error(res, 409, 'command-busy');
    const emergencyGeneration = emergencyGenerations.get(machine.id) ?? 0;
    pendingCommands.add(machine.id);
    const canWrite = () => !res.destroyed && sessions.get(session(req))?.role === 'admin' && store.state.machines.includes(machine) && !pendingEmergencies.has(machine.id) && (emergencyGenerations.get(machine.id) ?? 0) === emergencyGeneration;
    try {
      if (index === 0) trammingCycles.set(machine.id, []);
      const cycle = trammingCycles.get(machine.id) ?? [];
      if (cycle.length !== index) return error(res, 409, 'tramming-sequence');
      const measure = await tramming.measure(machine, index, canWrite);
      cycle.push(measure); trammingCycles.set(machine.id, cycle);
      diagnostics.record('tramming', 'point-' + (index + 1), machine.id);
      if (index < 3) return answer(res, 200, { measure });
      trammingCycles.delete(machine.id);
      try { await tramming.finish(machine); } catch { /* Mesures acquises ; la remontée de buse n'est pas renvoyée. */ }
      const result = trammingResult(cycle);
      if (result && store.state.machines.includes(machine)) {
        await persist({ ...store.state, machines: store.state.machines.map(item => item === machine ? { ...item, bedLevel: result } : item) });
      }
      return answer(res, 200, { measure, result });
    } catch (failure) {
      const code = /^tramming-|^command-busy$/.test(failure.message) ? failure.message : 'tramming-unavailable';
      if (code !== 'command-busy') trammingCycles.delete(machine.id);
      const status = ['tramming-state', 'command-busy'].includes(code) ? 409 : code === 'tramming-invalid' ? 400 : 502;
      return failure.nativeMessage ? answer(res, status, { error: code, nativeMessage: failure.nativeMessage }) : error(res, status, code);
    } finally { snapshot.forget(machine.id); pendingCommands.delete(machine.id); }
  }

  async function handleCommand(req, res) {
    const path = req.url;
    const activeSession = session(req);
    const viewer = sessions.get(activeSession);
    const command = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/command$/);
    if (!requireJson(req, res)) return;
    let data;
    try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
    const action = data.action;
    if (!['start', 'pause', 'resume', 'stop', 'emergencyStop'].includes(action)) return error(res, 400, 'invalid');
    const machine = store.state.machines.find(({ id }) => id === command[1]);
    if (!machine || !connectorDefinition(machine.kind ?? 'klipper')?.commands) return error(res, 404, 'missing');
    if (!connectorDefinition(machine.kind ?? 'klipper').commandActions.includes(action)) return error(res, 400, 'command-unsupported');
    if (['stop', 'start', 'emergencyStop'].includes(action) && data.confirm !== true) return error(res, 400, 'invalid');
    const emergency = action === 'emergencyStop';
    if (pendingEmergencies.has(machine.id) || (!emergency && (pendingCommands.has(machine.id) || pendingUploads.has(machine.id)))) return error(res, 409, 'command-busy');
    if (emergency && !withinLimit('emergency:' + machine.id)) return error(res, 429, 'rate');
    if (emergency) emergencyGenerations.set(machine.id, (emergencyGenerations.get(machine.id) ?? 0) + 1);
    const lock = emergency ? pendingEmergencies : pendingCommands;
    const before = { pause: ['printing'], resume: ['paused'], stop: ['printing', 'paused'], start: ['ready', 'done'] }[action];
    const after = { pause: ['paused'], resume: ['printing'], stop: ['ready', 'done'], start: ['printing'] }[action];
    lock.add(machine.id);
    try {
      const connector = await connectors.get(machine.kind ?? 'klipper');
      if (action === 'emergencyStop') {
        // Admin/CSRF guards run before this handler. No state gate: emergencies also happen during preparation.
        // Exactly one write; all following calls are read-only. Network loss never triggers a resend.
        if (res.destroyed) return;
        if (!session(req)) return error(res, 401, 'sign-in');
        let result;
        try { result = await connector.emergencyStop(machine); }
        catch { result = { outcome: 'unknown' }; }
        if (result.outcome === 'accepted') {
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              const report = await connector.read(machine);
              if (report.issue === 'moonraker-shutdown') return answer(res, 200, { ...result, outcome: 'confirmed', status: report.status, issue: report.issue });
            } catch { /* Preserve the acknowledged result even when observation fails. */ }
            if (attempt < 3) await delay(350);
          }
        }
        return answer(res, 200, result);
      }
      if (!before.includes((await connector.read(machine)).status)) return error(res, 409, 'command-state');
      if (res.destroyed) return;
      if (!session(req)) return error(res, 401, 'sign-in');
      try {
        if (pendingEmergencies.has(machine.id)) return error(res, 409, 'command-busy');
        if (!(await connector.command(machine, action))) return error(res, 502, 'command-rejected');
        for (let attempt = 0; attempt < 4; attempt++) {
          const report = await connector.read(machine), status = report.status;
          if (after.includes(status) || (machine.kind === 'longer-ray5' && action === 'stop' && status === 'error' && report.nativeState === 'Alarm' && report.spindle === 0 && report.feedRate === 0)) return answer(res, 200, { status });
          if (attempt < 3) await delay(350);
        }
      } catch (failure) {
        if (failure.message === 'bambu-authorization') return error(res, 403, 'bambu-authorization');
        /* The request may have reached the printer. Never retry it automatically. */
      }
      return error(res, 504, 'command-unconfirmed');
    } finally {
      snapshot.forget(machine.id);
      lock.delete(machine.id);
    }
  }

  async function handleControls(req, res) {
    const path = req.url;
    const activeSession = session(req);
    const viewer = sessions.get(activeSession);
    const controlsRoute = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/controls$/);
    const machine = store.state.machines.find(entry => entry.id === controlsRoute[1]);
    if (!machine || !connectorDefinition(machine.kind ?? 'klipper')?.controls) return error(res, 404, 'missing');
    if (req.method === 'POST' && viewer.role !== 'admin') return error(res, 403, 'forbidden');
    if (req.method === 'POST' && !requireJson(req, res)) return;
    let data;
    if (req.method === 'POST') { try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); } }
    if (req.method === 'POST' && (pendingEmergencies.has(machine.id) || pendingCommands.has(machine.id) || pendingUploads.has(machine.id))) return error(res, 409, 'command-busy');
    if (req.method === 'POST') {
      const now = Date.now(), key = 'controls:' + machine.id;
      const recent = (terminalUse.get(key) ?? []).filter(at => now - at < minute);
      // CC2 (limite de débit du broker) et CC1 (une connexion SDCP par commande) : 2 s minimum entre deux contrôles.
      if (recent.length >= 30 || (recent.length && now - recent.at(-1) < (machine.kind?.startsWith('elegoo') ? 2000 : 500))) return error(res, 429, 'rate');
      terminalUse.set(key, [...recent, now]);
      pendingCommands.add(machine.id);
    }
    let attempted = false;
    try {
      const connector = await connectors.get(machine.kind ?? 'klipper');
      const status = (await connector.read(machine)).status;
      if (req.method === 'POST' && !(machine.kind === 'longer-ray5' && ['reset','unlock','jog-cancel'].includes(data.action)) && !['ready', 'done', 'printing', 'paused'].includes(status)) return error(res, 409, 'command-state');
      const controls = await connector.control.read(machine);
      if (req.method === 'GET') return answer(res, 200, { ...controls, status });
      const command = validateControl(data, controls);
      if (!command) return error(res, 400, 'control-invalid');
      if (['move', 'home', 'zero', 'laser-pulse'].includes(command.action) && !['ready', 'done'].includes(status)) return error(res, 409, 'command-state');
      if (['printing', 'paused'].includes(status) && ['heat', 'fan', 'speed'].includes(command.action) && data.duringPrint !== true) return error(res, 409, 'control-confirm');
      if (res.destroyed) return;
      if (!session(req)) return error(res, 401, 'sign-in');
      if (pendingEmergencies.has(machine.id)) return error(res, 409, 'command-busy');
      attempted = true;
      const result = await connector.control.execute(machine, command, controls);
      diagnostics.record('controls', result.outcome, machine.id);
      return answer(res, result.outcome === 'rejected' ? 502 : 200, result.outcome === 'rejected' ? { error: 'command-rejected' } : result);
    } catch (failure) {
      if (failure.message === 'bambu-authorization') return error(res, 403, 'bambu-authorization');
      const heaterUnconfirmed = attempted && failure.message === 'heater-unconfirmed';
      diagnostics.record('controls', !attempted ? 'request-failed' : heaterUnconfirmed ? 'heater-unconfirmed' : failure.message === 'command-rejected' ? 'rejected' : 'unconfirmed', machine.id);
      return error(res, !attempted || failure.message === 'command-rejected' ? 502 : 504, !attempted ? 'controls-unavailable' : heaterUnconfirmed ? 'heater-unconfirmed' : failure.message === 'command-rejected' ? 'command-rejected' : 'command-unconfirmed');
    } finally { if (req.method === 'POST') pendingCommands.delete(machine.id); }
  }

  async function handleTerminal(req, res) {
    const path = req.url;
    const activeSession = session(req);
    const viewer = sessions.get(activeSession);
    const terminal = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/gcode$/);
    if (!requireJson(req, res)) return;
    let data;
    try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
    const script = typeof data.command === 'string' ? data.command.trim() : '';
    if (!/^[\x20-\x7E]{1,256}$/.test(script)) return error(res, 400, 'invalid');
    const machine = store.state.machines.find(({ id }) => id === terminal[1]);
    if (!machine || !connectorDefinition(machine.kind ?? 'klipper')?.terminal) return error(res, 404, 'missing');
    if (pendingEmergencies.has(machine.id) || pendingCommands.has(machine.id)) return error(res, 409, 'command-busy');
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
        if (pendingEmergencies.has(machine.id)) return error(res, 409, 'command-busy');
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

  async function handleFiles(req, res) {
    const path = req.url;
    const activeSession = session(req);
    const viewer = sessions.get(activeSession);
    const fileRoute = path.match(/^\/api\/machines\/([a-f0-9-]{36})\/(files|file|print|transfer)(?:\?(.*))?$/);
    const [, id, route, query = ''] = fileRoute;
    const machine = store.state.machines.find(entry => entry.id === id);
    if (!machine || !connectorDefinition(machine.kind ?? 'klipper')?.files) return error(res, 404, 'missing');
    const files = (await connectors.get(machine.kind ?? 'klipper')).files;
    const validPath = machine.kind === 'longer-ray5' ? ray5Path : connectorDefinition(machine.kind ?? 'klipper').projects ? productionPath : filePath;
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
      const destinationPath = destination?.kind === 'longer-ray5' ? ray5Path : definition?.projects ? productionPath : filePath;
      const name = data.name;
      if (!sourcePath || data.confirm !== true || !destination || destination.id === machine.id || !definition?.files ||
        (definition.fileFamily ?? 'fdm') !== (connectorDefinition(machine.kind ?? 'klipper').fileFamily ?? 'fdm') || !destinationPath(name) || name.includes('/') || /\.3mf$/i.test(sourcePath) !== /\.3mf$/i.test(name)) return error(res, 400, 'invalid');
      if ([machine.id, destination.id].some(id => pendingEmergencies.has(id) || pendingUploads.has(id) || pendingCommands.has(id))) return error(res, 409, 'upload-busy');
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
      if (size > (machine.kind === 'longer-ray5' ? 16 * 1024 * 1024 : fileLimit)) return error(res, 413, 'file-too-large');
      if (pendingEmergencies.has(machine.id) || pendingUploads.has(machine.id) || pendingCommands.has(machine.id)) return error(res, 409, 'upload-busy');
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
      if (machine.kind === 'longer-ray5' && data.operatorPresent !== true) return error(res, 400, 'laser-confirm');
      if (connectorDefinition(machine.kind ?? 'klipper').externalFilament && data.filamentMode !== 'external') return error(res, 400, 'filament-confirm');
      if (pendingEmergencies.has(machine.id) || pendingCommands.has(machine.id) || pendingUploads.has(machine.id)) return error(res, 409, 'command-busy');
      pendingCommands.add(machine.id);
      try {
        const connector = await connectors.get(machine.kind ?? 'klipper');
        if (!['ready', 'done'].includes((await connector.read(machine)).status)) return error(res, 409, 'command-state');
        if (res.destroyed) return;
        if (!session(req)) return error(res, 401, 'sign-in');
        try {
          if (pendingEmergencies.has(machine.id)) return error(res, 409, 'command-busy');
          if (!(await files.start(machine, target))) return error(res, 502, 'command-rejected');
          diagnostics.record('files', 'print-started', machine.id);
          for (let attempt = 0; attempt < 6; attempt++) {
            if ((await connector.read(machine)).status === 'printing') return answer(res, 200, { status: 'printing' });
            if (attempt < 5) await delay(500);
          }
        } catch (failure) {
          if (failure.message === 'bambu-authorization') return error(res, 403, 'bambu-authorization');
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

  // Repli des requêtes sans route : réponses historiques (405 après contrôle des droits, sinon 404).
  // Flux SSE (ADR 0004) : session obligatoire (garde du socle), reprise par Last-Event-ID, maintien toutes les
  // 15 s, fermeture à l'expiration ou à la révocation de la session ; quatre flux au plus par session.
  function handleEvents(req, res) {
    const key = session(req);
    const entry = key ? sessions.get(key) : null;
    if (!entry) return error(res, 401, 'sign-in');
    let existing = 0;
    events.close(subscriber => { if (subscriber.session === key) existing += 1; return false; });
    let excess = existing - 3;
    events.close(subscriber => subscriber.session === key && excess-- > 0);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    const subscriber = { session: key, viewer: { role: entry.role === 'admin' ? 'admin' : 'observer' }, write: frame => res.write(frame), close: () => res.end() };
    const lastEventId = typeof req.headers['last-event-id'] === 'string' && req.headers['last-event-id'].length <= 64 ? req.headers['last-event-id'] : null;
    const unsubscribe = events.subscribe(subscriber, lastEventId);
    void fleetWatcher.tick();
    const heartbeat = setInterval(() => {
      if (!(sessions.get(key)?.expires > Date.now())) return res.end();
      res.write(': ping\n\n');
    }, eventHeartbeatMs);
    res.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
  }

  async function handleFallback(req, res) {
    const path = req.url;
    const activeSession = session(req);
    const viewer = sessions.get(activeSession);
    const cloudRoute = /^\/api\/cloud-accounts(?:\/([a-f0-9-]{36})\/(login|verify|devices|disconnect|delete|logs|logs-download|telemetry-start|telemetry-stop|import))?$/.test(path);
    if (cloudRoute || path === '/api/cloud-certificates' || ['/api/notifications', '/api/notifications/test', '/api/discovery'].includes(path)) {
      if (!viewer) return error(res, 401, 'sign-in');
      if (viewer.role !== 'admin') return error(res, 403, 'forbidden');
      return error(res, 405, 'missing');
    }
    if (/^\/api\/machines\/([a-f0-9-]{36})\/(files|file|print|transfer)(?:\?(.*))?$/.test(path)) {
      if (!viewer) return error(res, 401, 'sign-in');
      return handleFiles(req, res);
    }
    return error(res, 404, 'missing');
  }
  // Services d'administration du parc, appelés par src/http/routes/machines.ts. Erreurs : HttpError (code stable).
  // `signal` est annulé quand le client ferme la requête ; `null` signifie alors qu'aucune réponse n'est due.
  const machineAdmin = {
    async write(action, data, { viewer, signal, stillSignedIn }) {
      const existing = store.state.machines.find((machine) => machine.id === data.id);
      if (existing && (pendingEmergencies.has(existing.id) || pendingCommands.has(existing.id))) throw new HttpError(409, 'command-busy');
      if (action === 'delete') {
        if (!existing) throw new HttpError(404, 'missing');
        const machines = store.state.machines.filter((machine) => machine !== existing);
        await persist({ ...store.state, machines });
        snapshot.forget(existing.id);
        machineLogs.forget(existing.id);
        connectors.forget(existing.kind ?? 'klipper', existing.id, true);
        for (const stream of cameraStreams.values()) {
          if (stream.machineId === existing.id) stream.controller.abort();
        }
        return { status: 200, body: { id: existing.id } };
      }
      if ((action === 'edit' || data.id) && !existing) throw new HttpError(404, 'missing');
      const name = value(data, 'name', 80).trim();
      const kind = data.kind ?? 'klipper';
      if (existing && kind !== (existing.kind ?? 'klipper')) throw new HttpError(400, 'machine-invalid');
      const definition = connectorDefinition(kind);
      const connection = definition?.configure(data, existing);
      if (!name || !connection) throw new HttpError(400, 'machine-invalid');
      const machine = { id: existing?.id ?? randomUUID(), name, kind, ...connection, ...(existing?.manualSpool ? { manualSpool: existing.manualSpool } : {}), ...(existing?.bedLevel && existing.origin === connection.origin ? { bedLevel: existing.bedLevel } : {}) };
      if (kind === 'bambu' && store.state.machines.some(item => item.id !== machine.id && ['bambu', 'bambu-cloud'].includes(item.kind) && item.serial === machine.serial)) throw new HttpError(409, 'cloud-machine-exists');
      const testing = action === 'test';
      const pairing = action === 'pair';
      if (pairing) {
        if (kind !== 'xtool-m2') throw new HttpError(400, 'machine-invalid');
        if (xtoolPairings.has(machine.origin)) throw new HttpError(409, 'xtool-pairing-busy');
        if (store.state.machines.some(entry => entry.origin === machine.origin && entry.id !== existing?.id)) {
          throw new HttpError(409, 'machine-duplicate');
        }
        if (!existing && store.state.machines.length >= 8) throw new HttpError(409, 'machine-limit');
      }
      const cc2TestKey = kind === 'elegoo' && !existing
        ? digest(JSON.stringify([machine.origin, machine.accessCode])).toString('hex')
        : null;
      const previousTest = cc2Tests.get(viewer);
      const verifiedCC2 = !testing && cc2TestKey && previousTest?.key === cc2TestKey && previousTest.expires > Date.now();
      if (verifiedCC2) {
        machine.serial = previousTest.serial;
      } else if (testing || definition.verify) {
        if (probes >= 2) throw new HttpError(429, 'probe-busy');
        probes++;
        if (pairing) xtoolPairings.add(machine.origin);
        try {
          const connector = await connectors.get(kind);
          if (signal.aborted) return null;
          const sameConnection = existing && existing.origin === machine.origin && existing.accessCode === machine.accessCode;
          const result = await connector.probe(machine, { signal, testing, sameConnection, pairing });
          if (signal.aborted) return null;
          if (pairing && !stillSignedIn()) throw new HttpError(401, 'sign-in');
          if (testing) {
            if (cc2TestKey) {
              cc2Tests.delete(viewer);
              if (result.ok && result.serial) {
                cc2Tests.set(viewer, { key: cc2TestKey, serial: result.serial, expires: Date.now() + 60_000 });
              }
            }
            return { status: 200, body: {
              ok: result.ok,
              issue: result.issue ?? (result.ok ? null : 'elegoo-report'),
              ...(result.ok && result.serial ? { serial: result.serial } : {})
            } };
          }
          if (!result.ok) throw new HttpError(422, result.issue ?? 'elegoo-info');
          machine.serial = result.serial;
          if (result.fingerprint) machine.fingerprint = result.fingerprint;
          if (pairing && result.pairingToken) machine.pairingToken = result.pairingToken;
          if (existing && !store.state.machines.includes(existing)) throw new HttpError(409, 'machine-changed');
        } finally {
          probes--;
          if (pairing) xtoolPairings.delete(machine.origin);
        }
      }
      if (store.state.machines.some((entry) => entry.id !== existing?.id &&
          (entry.origin === machine.origin || (machine.serial && entry.kind === kind && entry.serial === machine.serial)))) {
        throw new HttpError(409, 'machine-duplicate');
      }
      if (!existing && store.state.machines.length >= 8) throw new HttpError(409, 'machine-limit');
      const machines = existing ? store.state.machines.map((entry) => entry.id === machine.id ? machine : entry)
        : [...store.state.machines, machine];
      await persist({ ...store.state, machines });
      if (verifiedCC2) cc2Tests.delete(viewer);
      if (existing) {
        snapshot.forget(machine.id);
        connectors.forget(kind, machine.id, existing.origin !== machine.origin || existing.accessCode !== machine.accessCode);
        for (const stream of cameraStreams.values()) {
          if (stream.machineId === machine.id) stream.controller.abort();
        }
      }
      return { status: existing ? 200 : 201, body: { id: machine.id } };
    },
    networks: () => ({ networks: networks().map(({ cidr }) => cidr) }),
    async discover(data, signal) {
      const network = networks().find(({ cidr }) => cidr === data.network);
      if (!network) throw new HttpError(400, 'discovery-network');
      if (discoveryActive) throw new HttpError(429, 'discovery-busy');
      discoveryActive = true;
      try {
        const found = await scan(network, signal, { machines: store.state.machines, readRay5: async machine => (await connectors.get('longer-ray5')).read(machine) });
        if (signal.aborted) return null;
        return { devices: reconcileDiscovery(network, found, store.state.machines) };
      } finally {
        discoveryActive = false;
      }
    }
  };
  // Services des comptes, appelés par src/http/routes/accounts.ts. Erreurs : HttpError (code stable).
  const grant = (username, role) => ({ body: { authenticated: true, username, role }, cookie: newSession(username, role) });
  const accounts = {
    installed: accountService.installed,
    async setup(data) {
      const { username, role } = await accountService.setup(data);
      return grant(username, role);
    },
    async login(data, activeSession) {
      const { username, role } = await accountService.authenticate(data);
      if (activeSession) {
        sessions.delete(activeSession);
        stopCameraStreams(activeSession);
      }
      return grant(username, role);
    },
    logout(activeSession) {
      if (activeSession) {
        sessions.delete(activeSession);
        stopCameraStreams(activeSession);
        cloud.forgetOwner(activeSession);
      }
      return { body: { authenticated: false }, cookie: cookie('', 0) };
    },
    addObserver: data => accountService.addObserver(data)
  };
  // Services des notifications, appelés par src/http/routes/notifications.ts.
  const notificationService = createNotificationService({ store, persist, internal: () => internalNtfy(directory), send: notify, withinLimit });
  // Service de lecture du parc, appelé par la route typée GET /api/machines.
  // Télémétrie d'une machine telle que servie par GET /api/machines (lecture directe ou instantané en cache).
  async function telemetryOf(machine) {
    try {
      const telemetry = (connectorDefinition(machine.kind ?? 'klipper')?.live ? await connectors.read(machine.kind, machine) : null) ?? snapshot(machine);
      if (!['connecting', 'ready', 'printing', 'paused', 'done', 'offline', 'error'].includes(telemetry?.status)) throw new Error('invalid-telemetry');
      try { await projectService.observeExecution(machine.id, telemetry); } catch { /* A planning storage failure must not hide machine telemetry. */ }
      return telemetry;
    } catch {
      // One failed connector must not hide the rest of the fleet.
      const unavailable = { status: 'offline', issue: 'connection', progress: 0, nozzle: null, bed: null, file: '' };
      try { await projectService.observeExecution(machine.id, unavailable); } catch { /* Keep existing machine supervision available. */ }
      return unavailable;
    }
  }
  // Une seule boucle de lecture pour tous les navigateurs abonnés ; arrêtée sans abonné (MIG-05).
  // Version installée et mise à jour disponible (cache 10 min) ; `versionFetch` remplaçable par les tests.
  const versionService = createVersionService({ root: fileURLToPath(new URL('..', import.meta.url)), ...(versionFetch ? { fetcher: versionFetch } : {}) });
  const fleetWatcher = createFleetWatcher({ hub: events, machines: () => store.state.machines, read: telemetryOf });
  async function listFleet(activeSession) {
    const machines = await Promise.all(store.state.machines.map(async (machine) => {
      const definition = connectorDefinition(machine.kind ?? 'klipper');
      const telemetry = await telemetryOf(machine);
      if (!store.state.machines.includes(machine)) return null;
      diagnostics.status(machine.id, telemetry);
      return {
        id: machine.id, name: machine.name, origin: machine.origin, kind: machine.kind ?? 'klipper', serial: machine.serial,
        model: machine.kind === 'bambu-cloud' ? machine.model : definition?.model ?? connectorCatalog.klipper.model,
        cameraOpen: [...cameraStreams.values()].some(stream => stream.machineId === machine.id && [...stream.viewers.values()].some(({ owner }) => owner === activeSession)),
        ...telemetry,
        ...(machine.kind === 'bambu-cloud' ? { camera: bambuCameraInfo(machine.camera, experimentalCloudCamera) } : {}),
        capabilities: machine.kind === 'bambu-cloud' ? { ...connectorCatalog['bambu-cloud'], camera: bambuCameraInfo(machine.camera, experimentalCloudCamera).available } : machine.kind === 'longer-ray5' && machine.transport === 'esp3d'
          ? { ...connectorCatalog[machine.kind], controls: false, commands: false, commandActions: [] }
          : connectorCatalog[machine.kind ?? 'klipper'],
        ...(machine.transport ? { transport: machine.transport } : {}),
        ...(machine.kind === 'longer-ray5' ? { httpPort: machine.httpPort, wsPort: machine.wsPort } : {}),
        manualSpool: supportsManualSpool(machine.kind ?? 'klipper') ? manualSpool(machine.manualSpool) : null,
        ...((machine.kind ?? 'klipper') === 'klipper' && storedTramming(machine.bedLevel) ? { bedLevel: storedTramming(machine.bedLevel) } : {})
      };
    }));
    return machines.filter(Boolean);
  }
  // Socle HTTP (MIG-03) : Fastify route toutes les requêtes ; services et gestionnaires ci-dessus.
  const viewerOf = (req) => {
    const key = session(req);
    const entry = key ? sessions.get(key) : null;
    return entry ? { session: key, username: entry.username, role: entry.role } : null;
  };
  const projectService = createProjectService({ store, persist, readMachine: machine => connectors.read(machine.kind ?? 'klipper', machine), changed: () => events.publish('projects.changed', {}) });
  const http = createHttpApp({ allowedHost, origin: publicUrl.origin, limit: withinLimit, viewer: viewerOf, onFailure: () => diagnostics.record('server', 'request-failed'), fallback: handleFallback }, migratedRoutes({
    accounts,
    projects: projectService,
    session: { installed: () => Boolean(store.state.admin), oidcEnabled: () => Boolean(secure && oidc && store.state.admin), viewer: viewerOf },
    diagnostics: { view: () => diagnostics.view(), fleet: () => store.state.machines.map(({ id, name }) => ({ id, name })) },
    fleet: { list: viewer => listFleet(viewer.session) },
    machines: {
      write: (action, data, { viewer, signal, stillSignedIn }) => machineAdmin.write(action, data, { viewer: sessions.get(viewer.session), signal, stillSignedIn }),
      spool: (id, data) => metadata.setManualSpool(id, data),
      camera: async (id, data) => {
        const result = await metadata.setCameraConfig(id, data);
        for (const stream of cameraStreams.values()) if (stream.machineId === id) stream.controller.abort();
        diagnostics.trace(id, 'camera-configured', { mode: result.camera.mode, host: result.camera.host, transport: 'rtsps' });
        return result;
      },
      networks: () => machineAdmin.networks(),
      catalog: () => ({ connectors: Object.entries(connectorCatalog).filter(([, entry]) => entry.form !== 'cloud').map(([kind, entry]) => ({ kind, model: entry.model, form: entry.form, port: entry.port ?? null, required: entry.required === true })) }),
      discover: (data, signal) => machineAdmin.discover(data, signal)
    },
    notifications: notificationService,
    logs: {
      machine: id => store.state.machines.find(item => item.id === id) ?? null,
      machineLog: id => machineLogs.read(id),
      cloudAccounts: () => cloud.list(),
      cloudLog: id => cloud.logs(id),
      cloudFailure: failure => new HttpError(failure instanceof CloudError ? failure.status : 500, failure instanceof CloudError ? failure.message : 'cloud-storage')
    },
    events: { stream: handleEvents },
    version: { status: () => versionService.status() },
    operations: { klipperConfig: handleKlipperConfig, tramming: handleTramming, cloudAction: handleCloudAction, cloudCertificates: handleBambuCertificates, camera: handleCamera, command: handleCommand, controls: handleControls, terminal: handleTerminal, files: handleFiles },
    pages: { asset: handleAsset, oidc: handleOidc }
  }));
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 5_000 }, (req, res) => http.dispatch(req, res));
  server.once('listening', () => credentialRenewal.start());
  server.on('close', () => { credentialRenewal.close(); bambuLan.close(); fleetWatcher.stop(); events.close(() => true); connectors.close(); cloud.close(); void http.close(); });
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
  const logLevel = process.env.FABCORE_LOG_LEVEL || 'debug';
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) throw new Error('FABCORE_LOG_LEVEL invalide (debug, info, warn, error).');
  const directory = resolve(process.env.FABCORE_DATA || '.fabcore');
  // PostgreSQL si FABCORE_DATABASE_URL est défini (environnement ou fichier FABCORE_CONFIG, MIG-04), sinon state.json.
  // L'URL n'est jamais journalisée.
  const { loadDatabaseConfig } = await import('../src/config/database.ts');
  let store, database;
  try { database = loadDatabaseConfig(process.env); }
  catch (failure) {
    console.error(`FabCore · configuration invalide (${failure.message}) : vérifier ${failure.variable ?? 'la configuration'}.`);
    process.exit(1);
  }
  if (database) {
    const { openPostgresStore } = await import('../src/persistence/postgres-store.ts');
    try { store = await openPostgresStore({ config: database, directory }); }
    catch (failure) {
      const help = { 'database-import-required': 'base vide alors que state.json existe : lancer fabcore import (simulation), puis fabcore import --apply.', 'database-in-use': 'une autre instance FabCore utilise déjà cette base.', 'database-version': 'PostgreSQL 16 minimum requis.', 'config-ca-unreadable': 'certificat FABCORE_DATABASE_CA_FILE illisible.' };
      console.error(`FabCore · stockage PostgreSQL indisponible : ${help[failure.message] ?? failure.message.split('\n')[0]}`);
      process.exit(1);
    }
  }
  const { server, token } = createFabCore({ directory, ...(store ? { store } : {}), origin, oidc: createOidc(origin), logLevel });
  if (store) server.on('close', () => { void store.close(); });
  server.listen(port, host, () => {
    console.log(`FabCore · ${origin.origin}`);
    if (token) console.log(`Jeton d’activation (15 min, usage unique) : ${token}`);
  });
}
