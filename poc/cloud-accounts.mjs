import { privateIPv4 } from './connector-http.mjs';
import { CloudError, safeCloudPayload, createCloudHttp } from '../connectors/bambu/src/cloud-http.ts';
import { createCloudMonitor } from './bambu-cloud-monitor.mjs';
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
export { CloudError, safeCloudPayload } from '../connectors/bambu/src/cloud-http.ts';
const fail = (code, status) => { throw new CloudError(code, status); };
const text = (value, max) => typeof value === 'string' && value.length <= max ? value.trim() : '';

// Log sanitized protocol bodies and selected HTTP metadata, never raw credentials or exceptions.
export function createCloudAccounts({ store, directory, fetcher = fetch, now = Date.now, connectMqtt, createSigner, locateBambuHost, context = () => undefined }) {
  const logDirectory = join(directory, 'cloud-logs');
  mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  const monitors = new Map();
  const cameraCodes = new Map();
  const starts = new Map();
  let closed = false;
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
    const requestId = context();
    const level = /fail|error|denied|refus|invalid|expired|unconfirmed|unavailable|auth/i.test(event) ? 'warn' : 'info';
    let entry = { at: new Date(now()).toISOString(), level, ...(requestId ? { requestId } : {}), event, ...details };
    if (Buffer.byteLength(JSON.stringify(entry)) > 64 * 1024) entry = { at: entry.at, event, truncated: true, status: details.status, path: details.path, detailBytes: Buffer.byteLength(JSON.stringify(entry)) };
    appendFileSync(path, JSON.stringify(entry) + '\n', { mode: 0o600 });
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
  // Écriture attendue avant toute réponse ; base indisponible : refus explicite, état précédent conservé.
  async function save(next) {
    try { await store.save(next); }
    catch (error) { if (error.message === 'storage-unavailable') fail('storage-unavailable', 503); throw error; }
  }
  async function update(account, changes) {
    const next = { ...account, ...changes };
    await save({ ...store.state, cloudAccounts: entries().map(item => item.id === account.id ? next : item) });
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
      checkedAt: account.checkedAt ?? null, devices: (account.devices ?? []).map(device => { const machine = store.state.machines.find(item => ['bambu', 'bambu-cloud'].includes(item.kind) && item.serial === device.serial); return { ...device, fleetId: machine?.id ?? null, fleetMode: machine?.kind === 'bambu-cloud' ? 'cloud' : machine ? 'lan' : null }; }), truncated: account.truncated ?? false,
      telemetryEnabled: account.telemetryEnabled === true, telemetry: monitors.get(account.id)?.snapshot() ?? null,
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
      if (['cloud-auth', 'cloud-access'].includes(code)) await update(find(id), { status: 'reauth', issue: code });
      throw new CloudError(code, error.status ?? 502);
    } finally { busy.delete(id); authRequests.delete(id); }
  }
  const { bases, devices, login: cloudLogin, verify: cloudVerify, mqttUsername, cameraCodes: readCameraCodes } = createCloudHttp({ fetcher, now, log });
  async function complete(account, token, signal) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9._~-]{1,16384}$/.test(token)) fail('cloud-response');
    clearPending(account.id);
    const next = await update(account, { secret: encrypt(account.id, token), status: 'connected', issue: null, devices: [],
      connectedAt: new Date(now()).toISOString(), checkedAt: null });
    log(account.id, 'authenticated');
    // A successful login remains visible even if the following device-list call fails.
    try { return publicAccount(await update(next, await devices(next, token, signal))); }
    catch (error) {
      const code = error instanceof CloudError ? error.message : 'cloud-unavailable';
      log(account.id, 'devices-failed', { code });
      return publicAccount(await update(next, { issue: code, status: ['cloud-auth', 'cloud-access'].includes(code) ? 'reauth' : 'connected' }));
    }
  }
  function stopMonitor(id) { monitors.get(id)?.close(); monitors.delete(id); }
  async function startMonitor(id) {
    if (monitors.has(id) || starts.has(id) || closed) return starts.get(id);
    const task = (async () => {
      const account = find(id); bases(account);
      if (!account.secret || !account.devices?.length) fail('cloud-auth', 401);
      const secret = account.secret; const token = decrypt(account);
      const username = await mqttUsername(account, token);
      const current = find(id);
      if (closed || !current.telemetryEnabled || current.secret !== secret) return;
      monitors.set(id, createCloudMonitor({ account: current, token, username, now, connectMqtt, createSigner,
        authorized: serial => {
          const saved = entries().find(item => item.id === id);
          return !closed && saved?.secret === secret && saved.status === 'connected' && saved.telemetryEnabled && saved.devices?.some(device => device.serial === serial) &&
            store.state.machines.some(machine => machine.kind === 'bambu-cloud' && machine.cloudAccountId === id && machine.serial === serial);
        },
        log: (event, details) => log(id, event, safeCloudPayload(details, [token])) }));
    })();
    starts.set(id, task);
    try { await task; } finally { starts.delete(id); }
  }
  // Resume only accounts explicitly enabled by an administrator.
  queueMicrotask(() => { if (!closed) for (const account of entries()) if (account.telemetryEnabled && account.status === 'connected') {
    startMonitor(account.id).catch(error => { if (closed || !entries().some(item => item.id === account.id)) return; try { log(account.id, 'mqtt-start-failed', { code: error instanceof CloudError ? error.message : 'cloud-unavailable' }); } catch {} });
  } });
  function commandMonitor(machine) {
    const target = store.state.machines.find(item => item.id === machine.id);
    const account = entries().find(item => item.id === machine.cloudAccountId);
    if (closed || machine.kind !== 'bambu-cloud' || target?.kind !== 'bambu-cloud' || target.cloudAccountId !== machine.cloudAccountId || target.serial !== machine.serial ||
        !account?.secret || account.provider !== 'bambu' || account.status !== 'connected' || !account.telemetryEnabled || !account.devices?.some(device => device.serial === target.serial)) fail('cloud-auth', 401);
    const monitor = monitors.get(account.id);
    if (!monitor) fail('cloud-unavailable');
    return monitor;
  }
  return {
    send(machine, command, params = {}, channel = 'print') { return commandMonitor(machine).send(machine.serial, command, params, channel); },
    controlState(machine) { return commandMonitor(machine).controlState(machine.serial); },
    list() { return { providers: cloudProviders, accounts: entries().map(publicAccount) }; },
    async add(data) {
      if (entries().length >= 24) fail('cloud-limit', 409);
      const provider = cloudProviders.find(item => item.id === data.provider);
      const name = text(data.name, 80); const email = text(data.email, 254);
      if (!provider || !name || !['global', 'china'].includes(data.region) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) fail('cloud-invalid', 400);
      const account = { id: randomUUID(), provider: provider.id, name, email, region: data.region, status: 'disconnected', devices: [] };
      await save({ ...store.state, cloudAccounts: [...entries(), account] });
      log(account.id, 'account-created', { provider: provider.id, region: account.region });
      return publicAccount(account);
    },
    login(id, data, owner, signal) { return locked(id, async signal => {
      const account = find(id); bases(account);
      if (!account.email || typeof data.password !== 'string' || !data.password || data.password.length > 256) fail('cloud-invalid', 400);
      const previous = loginAttempts.get(id);
      if (previous !== undefined && now() - previous < 60_000) { log(id, 'login-throttled'); fail('cloud-login-wait', 429); }
      loginAttempts.set(id, now());
      stopMonitor(id);
      clearPending(id);
      // A new authentication attempt explicitly disconnects the previous credential.
      await update(account, { secret: undefined, status: 'disconnected', telemetryEnabled: false, devices: [], issue: null });
      const result = await cloudLogin(account, data.password, signal);
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
      return complete(account, await cloudVerify(account, flow, data.code, signal), signal);
    }, owner, signal); },
    refresh(id, signal) { return locked(id, async () => {
      const account = find(id); bases(account);
      if (!account.secret) fail('cloud-auth', 401);
      return publicAccount(await update(account, await devices(account, decrypt(account), signal)));
    }); },
    importDevice(id, serial) { return locked(id, async () => {
      const account = find(id); bases(account);
      const device = account.devices?.find(item => item.serial === serial);
      if (!device || !account.secret || account.status !== 'connected') fail('cloud-auth', 401);
      if (store.state.machines.some(item => ['bambu', 'bambu-cloud'].includes(item.kind) && item.serial === serial)) fail('cloud-machine-exists', 409);
      await update(account, { telemetryEnabled: true }); await startMonitor(id);
      // Recheck after the asynchronous identity request, across all accounts and LAN.
      if (store.state.machines.some(item => ['bambu', 'bambu-cloud'].includes(item.kind) && item.serial === serial)) fail('cloud-machine-exists', 409);
      const machine = { id: randomUUID(), kind: 'bambu-cloud', name: device.name, model: 'Bambu Lab · ' + device.model,
        serial, cloudAccountId: id, mode: 'cloud', camera: { mode: 'auto', host: '' }, origin: 'mqtts://' + (account.region === 'china' ? 'cn' : 'us') + '.mqtt.bambulab.com:8883' };
      await save({ ...store.state, machines: [...store.state.machines, machine] });
      log(id, 'machine-imported', { serial, machineId: machine.id });
      return { id: machine.id };
    }); },
    async cameraHost(machine, signal) {
      const target = store.state.machines.find(item => item.id === machine.id);
      const account = entries().find(item => item.id === machine.cloudAccountId);
      const allowed = () => !closed && target?.kind === 'bambu-cloud' && target.serial === machine.serial && target.cloudAccountId === machine.cloudAccountId &&
        store.state.machines.some(item => item.id === target.id && item.serial === target.serial && item.cloudAccountId === target.cloudAccountId && JSON.stringify(item.camera) === JSON.stringify(target.camera)) &&
        account?.provider === 'bambu' && account.secret && entries().some(item => item.id === account.id && item.secret === account.secret && item.status === 'connected' && item.devices?.some(device => device.serial === machine.serial));
      if (!allowed()) fail('cloud-auth', 401);
      const host = privateIPv4(target.camera?.host) ? target.camera.host : await locateBambuHost?.(machine.serial, signal);
      if (signal?.aborted || !allowed()) fail('cloud-auth', 401);
      if (!privateIPv4(host)) fail('camera-host-required', 503);
      return host;
    },
    async fileConnection(machine, signal) {
      commandMonitor(machine);
      const target = store.state.machines.find(item => item.id === machine.id);
      const host = await this.cameraHost(target, signal);
      const { accessCode, authorized } = await this.cameraConnection(target, signal);
      if (!authorized()) fail('cloud-auth', 401);
      return { ...target, origin: 'mqtts://' + host + ':8883', accessCode, authorized };
    },
    async cameraConnection(machine, signal) {
      const account = find(machine.cloudAccountId);
      const authorized = () => {
        const current = entries().find(item => item.id === machine.cloudAccountId), target = store.state.machines.find(item => item.id === machine.id);
        return !closed && !['cloud-auth', 'cloud-access'].includes(monitors.get(machine.cloudAccountId)?.snapshot()?.issue) &&
          target?.kind === 'bambu-cloud' && target.cloudAccountId === account.id && target.serial === machine.serial && JSON.stringify(target.camera) === JSON.stringify(machine.camera) &&
          current?.status === 'connected' && current.secret === account.secret && current.region === account.region && current.devices?.some(item => item.serial === machine.serial);
      };
      if (machine.kind !== 'bambu-cloud' || account.provider !== 'bambu' || !account.secret || !authorized()) fail('cloud-auth', 401);
      const key = account.id;
      for (const [key, entry] of cameraCodes) if (entry.until <= now()) { clearTimeout(entry.timer); cameraCodes.delete(key); }
      let cached = cameraCodes.get(key);
      if (!cached || cached.secret !== account.secret) {
        cached = { secret: account.secret, until: now() + 30000, task: readCameraCodes(account, decrypt(account)) };
        cameraCodes.set(key, cached);
        const entry = cached; entry.timer = setTimeout(() => { if (cameraCodes.get(key) === entry) cameraCodes.delete(key); }, 30000); entry.timer.unref?.();
        // Keep failures for the same short window too: repeated preview clicks must not flood Cloud.
        cached.task.catch(() => {});
      }
      const accessCode = (await cached.task).get(machine.serial);
      if (!accessCode) fail('camera-credentials');
      if (signal?.aborted || !authorized()) fail('cloud-auth', 401);
      return { accessCode, authorized };
    },
    readMachine(machine) {
      const session = monitors.get(machine.cloudAccountId)?.snapshot();
      const device = session?.devices.find(item => item.serial === machine.serial);
      const stale = !device || device.stale;
      const states = { RUNNING: 'printing', PAUSE: 'paused', FINISH: 'done', IDLE: 'ready', FAILED: 'error', PREPARE: 'printing' };
      return { status: stale ? session?.status === 'connecting' ? 'connecting' : 'offline' : states[device.state] ?? 'ready',
        issue: session?.issue ?? null, nozzle: stale ? null : device.heaters.find(item => item.id === 'nozzle')?.current ?? null,
        bed: stale ? null : device.heaters.find(item => item.id === 'bed')?.current ?? null,
        progress: stale ? 0 : device.progress, file: stale ? '' : device.file,
        filaments: stale ? [] : device.filaments, checkedAt: device?.checkedAt ?? null };
    },
    telemetry(id, enabled) { return locked(id, async () => {
      const account = find(id); bases(account);
      if (enabled && (!account.secret || account.status !== 'connected')) fail('cloud-auth', 401);
      await update(account, { telemetryEnabled: enabled });
      if (enabled) await startMonitor(id); else stopMonitor(id);
      return publicAccount(find(id));
    }); },
    async disconnect(id, remove = false) {
      const account = find(id); if (busy.has(id)) fail('cloud-busy', 409);
      if (remove && store.state.machines.some(machine => machine.cloudAccountId === id)) fail('cloud-in-use', 409);
      stopMonitor(id);
      for (const key of cameraCodes.keys()) if (key === id) { clearTimeout(cameraCodes.get(key).timer); cameraCodes.delete(key); }
      clearPending(id);
      if (remove) {
        await save({ ...store.state, cloudAccounts: entries().filter(item => item.id !== id) });
        for (const suffix of ['', '.1']) { try { unlinkSync(logPath(id) + suffix); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
        limits.delete(id); loginAttempts.delete(id); return { deleted: true };
      }
      log(id, 'disconnected');
      return publicAccount(await update(account, { secret: undefined, status: 'disconnected', telemetryEnabled: false, devices: [], issue: null }));
    },
    logs(id) {
      if (!uuid.test(id)) fail('missing', 404); find(id);
      return ['.1', ''].map(suffix => { try { return readFileSync(logPath(id) + suffix, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; return ''; } }).join('');
    },
    forgetOwner(owner) { for (const entry of authRequests.values()) if (entry.owner === owner) entry.abort.abort(); for (const [id, flow] of pending) if (flow.owner === owner) clearPending(id); },
    close() { closed = true; for (const entry of cameraCodes.values()) clearTimeout(entry.timer); cameraCodes.clear(); for (const id of monitors.keys()) stopMonitor(id); for (const entry of authRequests.values()) entry.abort.abort(); for (const id of pending.keys()) clearPending(id); }
  };
}
