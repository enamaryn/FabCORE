import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const cloudProviders = [
  { id: 'bambu', name: 'Bambu Lab', available: true },
  ...[['creality', 'Creality'], ['elegoo', 'Elegoo'], ['prusa', 'Prusa'], ['xtool', 'xTool'], ['anycubic', 'Anycubic']]
    .map(([id, name]) => ({ id, name, available: false }))
];
const age = 10 * 60_000;
const uuid = /^[a-f0-9-]{36}$/;
export class CloudError extends Error {
  constructor(code, status = 502) { super(code); this.status = status; }
}
const fail = (code, status) => { throw new CloudError(code, status); };
const text = (value, max) => typeof value === 'string' && value.length <= max ? value.trim() : '';
const safeCode = value => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

// Only explicitly selected fields are logged. Never serialize provider bodies or exceptions.
export function createCloudAccounts({ store, directory, fetcher = fetch, now = Date.now }) {
  const logDirectory = join(directory, 'cloud-logs');
  mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  const pending = new Map();
  const busy = new Set();
  const authRequests = new Map();
  const limits = new Map();
  const loginAttempts = new Map();
  const timers = new Map();
  const keyFile = join(directory, 'cloud-secret.key');
  const entries = () => store.state.cloudAccounts ?? [];
  const find = id => entries().find(account => account.id === id) ?? fail('missing', 404);
  const logPath = id => join(logDirectory, id + '.log');
  function log(id, event, details = {}) {
    const path = logPath(id);
    try {
      if (statSync(path).size >= 256 * 1024) renameSync(path, path + '.1');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    appendFileSync(path, JSON.stringify({ at: new Date(now()).toISOString(), event, ...details }) + '\n', { mode: 0o600 });
  }
  function key() {
    try { const bytes = readFileSync(keyFile); if (bytes.length !== 32) fail('cloud-storage'); return bytes; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (entries().some(account => account.secret)) fail('cloud-storage');
      const bytes = randomBytes(32);
      writeFileSync(keyFile, bytes, { mode: 0o600, flag: 'wx', flush: true });
      return bytes;
    }
  }
  function encrypt(id, token) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(), iv);
    cipher.setAAD(Buffer.from(id));
    return Buffer.concat([iv, cipher.update(token), cipher.final(), cipher.getAuthTag()]).toString('base64');
  }
  function decrypt(account) {
    try {
      const data = Buffer.from(account.secret, 'base64');
      const cipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
      cipher.setAAD(Buffer.from(account.id)); cipher.setAuthTag(data.subarray(-16));
      return Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]).toString();
    } catch { fail('cloud-storage'); }
  }
  function update(account, changes) {
    const next = { ...account, ...changes };
    store.save({ ...store.state, cloudAccounts: entries().map(item => item.id === account.id ? next : item) });
    return next;
  }
  function clearPending(id) { clearTimeout(timers.get(id)); timers.delete(id); pending.delete(id); }
  function challenge(id, flow) {
    clearPending(id); pending.set(id, { ...flow, expires: now() + age, attempts: 0 });
    const timer = setTimeout(() => clearPending(id), age); timer.unref?.(); timers.set(id, timer);
  }
  function publicAccount(account) {
    const flow = pending.get(account.id);
    return { id: account.id, provider: account.provider, name: account.name, email: account.email, region: account.region,
      status: account.status, issue: account.issue ?? null, connectedAt: account.connectedAt ?? null,
      checkedAt: account.checkedAt ?? null, devices: account.devices ?? [], truncated: account.truncated ?? false,
      challenge: flow && flow.expires > now() ? flow.kind : null, challengeExpiresAt: flow ? new Date(flow.expires).toISOString() : null };
  }
  function rate(id) {
    let bucket = limits.get(id);
    if (!bucket || bucket.until <= now()) { bucket = { count: 0, until: now() + 60_000 }; limits.set(id, bucket); }
    if (++bucket.count > 5) fail('rate', 429);
  }
  async function locked(id, action, owner, signal) {
    find(id);
    if (busy.has(id)) fail('cloud-busy', 409);
    rate(id); busy.add(id);
    const abort = new AbortController();
    if (owner) authRequests.set(id, { owner, abort });
    try { return await action(signal ? AbortSignal.any([signal, abort.signal]) : abort.signal); }
    catch (error) {
      const code = error instanceof CloudError ? error.message : 'cloud-unavailable';
      log(id, 'operation-failed', { code });
      if (['cloud-auth', 'cloud-access'].includes(code)) update(find(id), { status: 'reauth', issue: code });
      throw new CloudError(code, error.status ?? 502);
    } finally { busy.delete(id); authRequests.delete(id); }
  }
  function bases(account) {
    if (account.provider !== 'bambu') fail('cloud-unsupported', 400);
    const china = account.region === 'china';
    return { api: 'https://api.bambulab.' + (china ? 'cn' : 'com'), portal: 'https://bambulab.' + (china ? 'cn' : 'com') };
  }
  async function request(account, origin, path, { method = 'GET', body, token, headers = {}, cookies = false, signal } = {}) {
    if (signal?.aborted) fail('cloud-unavailable');
    const start = now();
    log(account.id, 'http-start', { method, host: new URL(origin).hostname, path });
    let response;
    try {
      response = await fetcher(origin + path, { method, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json', 'User-Agent': 'FabCore/POC', ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch (error) {
      log(account.id, 'http-network', { elapsedMs: now() - start, timeout: error?.name === 'TimeoutError',
        reason: ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error?.cause?.code) ? error.cause.code : 'network' });
      fail('cloud-unavailable');
    }
    log(account.id, 'http-headers', { status: response.status, elapsedMs: now() - start });
    let data = null;
    // Limit provider responses before parsing and never expose the body to a caller or log.
    try {
      if (response.body) {
        const reader = response.body.getReader(); let size = 0; const chunks = [];
        try {
          for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 1024 * 1024) fail('cloud-response'); chunks.push(Buffer.from(item.value)); }
          if (size) { try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* HTML challenges are reported by HTTP status. */ } }
        } finally { await reader.cancel().catch(() => {}); }
      }
    } catch (error) { if (error instanceof CloudError) throw error; fail('cloud-unavailable'); }
    if (signal?.aborted) fail('cloud-unavailable');
    log(account.id, 'http-result', { method, path, status: response.status, elapsedMs: now() - start,
      contentType: response.headers.get('content-type')?.includes('json') ? 'json' : 'other',
      code: safeCode(data?.code), loginType: ['verifyCode', 'tfa'].includes(data?.loginType) ? data.loginType : undefined,
      tokenPresent: Boolean(data?.accessToken), deviceCount: Array.isArray(data?.devices) ? data.devices.length : undefined });
    if (response.status === 429) fail('cloud-rate', 429);
    if (response.status === 401) fail('cloud-auth', 401);
    if (response.status === 403) fail('cloud-access', 403);
    if (response.status === 400 && data?.code === 1) fail('cloud-code-expired', 400);
    if (response.status === 400 && data?.code === 2) fail('cloud-code', 400);
    if (!response.ok) fail(response.status === 400 ? 'cloud-auth' : 'cloud-unavailable', response.status === 400 ? 400 : 502);
    if (!cookies && (!data || typeof data !== 'object' || Array.isArray(data))) fail('cloud-response');
    return { data, headers: response.headers };
  }
  function cookie(headers, name) {
    const values = headers.getSetCookie?.() ?? [];
    const value = values.find(item => item.startsWith(name + '='))?.split(';')[0].slice(name.length + 1);
    return value && /^[A-Za-z0-9._~%+\/-]{1,16384}$/.test(value) ? value : null;
  }
  async function devices(account, token, signal) {
    const { data } = await request(account, bases(account).api, '/v1/iot-service/api/user/bind', { token, signal });
    if (!Array.isArray(data.devices)) fail('cloud-response');
    const seen = new Set();
    const list = data.devices.slice(0, 200).flatMap(item => {
      const serial = text(item.dev_id, 64);
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(serial) || seen.has(serial)) return [];
      seen.add(serial);
      return [{ serial, name: text(item.name, 120) || serial, model: text(item.dev_product_name, 120) || text(item.dev_model_name, 120),
        online: typeof item.online === 'boolean' ? item.online : null, status: text(item.print_status, 40) }];
    });
    log(account.id, 'devices-read', { count: list.length, truncated: data.devices.length > 200 });
    return { devices: list, truncated: data.devices.length > 200, checkedAt: new Date(now()).toISOString(), issue: null };
  }
  async function complete(account, token, signal) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9._~-]{1,16384}$/.test(token)) fail('cloud-response');
    clearPending(account.id);
    const next = update(account, { secret: encrypt(account.id, token), status: 'connected', issue: null, devices: [],
      connectedAt: new Date(now()).toISOString(), checkedAt: null });
    log(account.id, 'authenticated');
    // A successful login remains visible even if the following device-list call fails.
    try { return publicAccount(update(next, await devices(next, token, signal))); }
    catch (error) {
      const code = error instanceof CloudError ? error.message : 'cloud-unavailable';
      log(account.id, 'devices-failed', { code });
      return publicAccount(update(next, { issue: code, status: ['cloud-auth', 'cloud-access'].includes(code) ? 'reauth' : 'connected' }));
    }
  }
  return {
    list() { return { providers: cloudProviders, accounts: entries().map(publicAccount) }; },
    add(data) {
      if (entries().length >= 24) fail('cloud-limit', 409);
      const provider = cloudProviders.find(item => item.id === data.provider);
      const name = text(data.name, 80); const email = text(data.email, 254);
      if (!provider || !name || !['global', 'china'].includes(data.region) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) fail('cloud-invalid', 400);
      const account = { id: randomUUID(), provider: provider.id, name, email, region: data.region, status: 'disconnected', devices: [] };
      store.save({ ...store.state, cloudAccounts: [...entries(), account] });
      log(account.id, 'account-created', { provider: provider.id, region: account.region });
      return publicAccount(account);
    },
    login(id, data, owner, signal) { return locked(id, async signal => {
      const account = find(id); const { api } = bases(account);
      if (!account.email || typeof data.password !== 'string' || !data.password || data.password.length > 256) fail('cloud-invalid', 400);
      const previous = loginAttempts.get(id);
      if (previous !== undefined && now() - previous < 60_000) { log(id, 'login-throttled'); fail('cloud-login-wait', 429); }
      loginAttempts.set(id, now());
      clearPending(id);
      // A new authentication attempt explicitly disconnects the previous credential.
      update(account, { secret: undefined, status: 'disconnected', devices: [], issue: null });
      const { data: result } = await request(account, api, '/v1/user-service/user/login', { method: 'POST', body: { account: account.email, password: data.password, apiError: '' }, signal });
      if (result.accessToken) return complete(find(id), result.accessToken, signal);
      if (result.loginType === 'verifyCode') {
        // Bambu already dispatches the code during login. Do not send a second email.
        challenge(id, { owner, kind: 'email' });
      } else if (result.loginType === 'tfa' && typeof result.tfaKey === 'string' && result.tfaKey.length <= 16384) {
        challenge(id, { owner, kind: 'totp', tfaKey: result.tfaKey });
      } else fail('cloud-auth', 400);
      log(id, 'challenge-required', { kind: pending.get(id).kind });
      return publicAccount(find(id));
    }, owner, signal); },
    verify(id, data, owner, signal) { return locked(id, async signal => {
      const account = find(id); const flow = pending.get(id);
      if (!flow || flow.expires <= now()) { clearPending(id); fail('cloud-code-expired', 400); }
      if (flow.owner !== owner) fail('forbidden', 403);
      if (typeof data.code !== 'string' || !/^\d{6}$/.test(data.code)) fail('cloud-code', 400);
      if (++flow.attempts > 5) { clearPending(id); fail('cloud-code-expired', 400); }
      const { api, portal } = bases(account);
      if (flow.kind === 'email') {
        const result = await request(account, api, '/v1/user-service/user/login', { method: 'POST', body: { account: account.email, code: data.code }, signal });
        return complete(account, result.data.accessToken, signal);
      }
      const csrf = await request(account, portal, '/api/csrf', { cookies: true, signal });
      const csrfToken = cookie(csrf.headers, 'bbl_csrf_token');
      if (!csrfToken) fail('cloud-challenge');
      const result = await request(account, portal, '/api/sign-in/tfa', { method: 'POST', cookies: true, signal,
        headers: { 'x-bbl-csrf-token': csrfToken, Cookie: 'bbl_csrf_token=' + csrfToken }, body: { tfaKey: flow.tfaKey, tfaCode: data.code } });
      return complete(account, cookie(result.headers, 'token') ?? result.data?.accessToken, signal);
    }, owner, signal); },
    refresh(id, signal) { return locked(id, async () => {
      const account = find(id); bases(account);
      if (!account.secret) fail('cloud-auth', 401);
      return publicAccount(update(account, await devices(account, decrypt(account), signal)));
    }); },
    disconnect(id, remove = false) {
      const account = find(id); if (busy.has(id)) fail('cloud-busy', 409);
      clearPending(id);
      if (remove) {
        store.save({ ...store.state, cloudAccounts: entries().filter(item => item.id !== id) });
        for (const suffix of ['', '.1']) { try { unlinkSync(logPath(id) + suffix); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
        limits.delete(id); loginAttempts.delete(id); return { deleted: true };
      }
      log(id, 'disconnected');
      return publicAccount(update(account, { secret: undefined, status: 'disconnected', devices: [], issue: null }));
    },
    logs(id) {
      if (!uuid.test(id)) fail('missing', 404); find(id);
      return ['.1', ''].map(suffix => { try { return readFileSync(logPath(id) + suffix, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; return ''; } }).join('');
    },
    forgetOwner(owner) { for (const entry of authRequests.values()) if (entry.owner === owner) entry.abort.abort(); for (const [id, flow] of pending) if (flow.owner === owner) clearPending(id); },
    close() { for (const entry of authRequests.values()) entry.abort.abort(); for (const id of pending.keys()) clearPending(id); }
  };
}
