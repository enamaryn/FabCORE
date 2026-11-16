import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { moonrakerOrigin, readMoonraker } from './moonraker.mjs';
import { openStore } from './store.mjs';

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
  return function snapshot(machine) {
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
        entry.next = Date.now() + 1000;
        entry.pending = null;
      });
    }
    return { ...entry.current, checkedAt: entry.checkedAt ?? null };
  };
}

export function createFabCore({ directory, origin, readPrinter = readMoonraker, activationToken } = {}) {
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
  const snapshot = monitor(readPrinter);
  function cookie(value, age) {
    return `fabcore_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`;
  }
  function session(req) {
    const id = req.headers.cookie?.match(/(?:^|;\s*)fabcore_session=([\w-]{43})(?:;|$)/)?.[1];
    if (!id) return null;
    const key = digest(id).toString('hex');
    const expires = sessions.get(key);
    if (expires > Date.now()) return key;
    sessions.delete(key);
    return null;
  }
  function signIn(res) {
    const id = randomBytes(32).toString('base64url');
    for (const [key, expires] of sessions) if (expires <= Date.now()) sessions.delete(key);
    if (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
    sessions.set(digest(id).toString('hex'), Date.now() + sessionAge);
    answer(res, 200, { authenticated: true, username: store.state.admin.username }, { 'Set-Cookie': cookie(id, sessionAge / 1000) });
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
    if (req.method === 'GET' && assets.has(path)) {
      const [type, body] = assets.get(path);
      res.writeHead(200, { 'Content-Type': type });
      return res.end(body);
    }
    const activeSession = session(req);
    if (req.method === 'GET' && path === '/api/session') {
      return answer(res, 200, {
        installed: Boolean(store.state.admin), authenticated: Boolean(activeSession),
        username: activeSession ? store.state.admin.username : null
      });
    }
    if (req.method === 'GET' && path === '/api/machines') {
      if (!activeSession) return error(res, 401, 'sign-in');
      return answer(res, 200, { machines: store.state.machines.map((machine) => ({
        id: machine.id, name: machine.name, origin: machine.origin, model: 'Klipper · Moonraker',
        ...snapshot(machine)
      })) });
    }
    if (req.method !== 'POST' || !['/api/setup', '/api/login', '/api/logout', '/api/machines'].includes(path)) {
      return error(res, 404, 'missing');
    }
    if (!requireJson(req, res)) return;
    if (path === '/api/logout') {
      if (activeSession) sessions.delete(activeSession);
      return answer(res, 200, { authenticated: false }, { 'Set-Cookie': cookie('', 0) });
    }
    if (path === '/api/machines' && !activeSession) return error(res, 401, 'sign-in');
    if (path === '/api/setup' && store.state.admin) return error(res, 409, 'installed');
    if ((path === '/api/setup' || path === '/api/login') && !withinLimit(path)) return error(res, 429, 'rate');
    let data;
    try { data = await readJson(req); } catch { return error(res, 400, 'invalid'); }
    if (path === '/api/machines') {
      const name = value(data, 'name', 80).trim();
      const origin = moonrakerOrigin(value(data, 'origin', 200).trim());
      const apiKey = value(data, 'apiKey', 256).trim();
      if (!name || !origin || (data.apiKey && (!apiKey || !/^[!-~]+$/.test(apiKey)))) return error(res, 400, 'machine-invalid');
      if (store.state.machines.some((machine) => machine.origin === origin)) return error(res, 409, 'machine-duplicate');
      if (store.state.machines.length >= 8) return error(res, 409, 'machine-limit');
      const id = randomUUID();
      store.save({ ...store.state, machines: [...store.state.machines, { id, name, origin, apiKey }] });
      return answer(res, 201, { id });
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
      return signIn(res);
    }
    const admin = store.state.admin;
    if (!admin || !password) return error(res, 401, 'credentials');
    const hash = await derive(password, admin.salt, 64);
    if (!timingSafeEqual(hash, Buffer.from(admin.hash, 'hex')) || username !== admin.username) return error(res, 401, 'credentials');
    if (activeSession) sessions.delete(activeSession);
    return signIn(res);
  }
  const server = createServer({ requestTimeout: 10_000, headersTimeout: 5_000 }, (req, res) => {
    route(req, res).catch(() => {
      if (!res.headersSent) error(res, 500, 'internal');
      else res.end();
    });
  });
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
  const { server, token } = createFabCore({ directory: resolve(process.env.FABCORE_DATA || '.fabcore'), origin });
  server.listen(port, host, () => {
    console.log(`FabCore · ${origin.origin}`);
    if (token) console.log(`Jeton d’activation (15 min, usage unique) : ${token}`);
  });
}
