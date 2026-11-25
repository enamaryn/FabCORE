/** Bambu Cloud HTTP protocol. Account storage, authorization and log sinks belong to the caller. */
export interface CloudAccount { id: string; provider: string; region: string; email?: string }
interface CloudResponse {
  code?: unknown; loginType?: unknown; accessToken?: unknown; tfaKey?: unknown; uid?: unknown;
  devices?: { dev_access_code?: unknown; dev_id?: unknown; name?: unknown; dev_product_name?: unknown; dev_model_name?: unknown; online?: unknown; print_status?: unknown }[];
}
interface RequestOptions {
  method?: string; body?: Record<string, unknown>; token?: string; headers?: Record<string, string>;
  cookies?: boolean; signal?: AbortSignal | undefined;
}
export interface CloudHttpOptions {
  fetcher?: typeof fetch; now?: () => number;
  log(id: string, event: string, details: Record<string, unknown>): void;
}
export class CloudError extends Error {
  status: number;
  constructor(code: string, status = 502) { super(code); this.status = status; }
}
function fail(code: string, status?: number): never { throw new CloudError(code, status); }
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value.trim() : '';
const safeCode = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

// Retain unknown protocol fields for debugging, but never authentication secrets.
export function safeCloudPayload(value: unknown, secrets: unknown[] = [], depth = 0, key = ''): unknown {
  if (depth > 10) return '[depth limit]';
  if (/password|passwd|token|secret|cookie|ttcode|authorization|access.?code|api.?key|tfa.?key|csrf|auth.?key|credential|signature|private.?key|app_cert|printer_cert|dev_cert|sign_string|param_enc|url_enc|refreshUrl|^crl$|^cert$|^key$/i.test(key) ||
      /^(code|tfaCode|verificationCode)$/i.test(key) && typeof value !== 'number') return '[redacted]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    let result = value.slice(0, 1000);
    for (const secret of secrets) if (typeof secret === 'string' && secret.length) result = result.replaceAll(secret, '[redacted]');
    return result.replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [redacted]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]')
      .replace(/((?:token|password|authkey|passwd|signature|credential|code)=)[^&\s"<>]+/gi, '$1[redacted]');
  }
  if (Array.isArray(value)) return value.slice(0, 200).map(item => safeCloudPayload(item, secrets, depth + 1));
  if (typeof value !== 'object') return undefined;
  const result: Record<string, unknown> = {};
  for (const [name, item] of Object.entries(value).slice(0, 100)) {
    if (['__proto__', 'constructor', 'prototype'].includes(name)) continue;
    result[name] = safeCloudPayload(item, secrets, depth + 1, name);
  }
  return result;
}

export function createCloudHttp({ fetcher = fetch, now = Date.now, log }: CloudHttpOptions) {
  function bases(account: CloudAccount) {
    if (account.provider !== 'bambu') fail('cloud-unsupported', 400);
    const china = account.region === 'china';
    return { api: 'https://api.bambulab.' + (china ? 'cn' : 'com'), portal: 'https://bambulab.' + (china ? 'cn' : 'com') };
  }
  async function request(account: CloudAccount, origin: string, path: string, { method = 'GET', body, token, headers = {}, cookies = false, signal }: RequestOptions = {}) {
    if (signal?.aborted) fail('cloud-unavailable');
    const start = now();
    const secrets = [body?.password, body?.code, body?.tfaCode, body?.tfaKey, token, headers.Cookie, headers['x-bbl-csrf-token']];
    log(account.id, 'http-start', { method, host: new URL(origin).hostname, path, request: safeCloudPayload(body ?? {}, secrets) });
    let response;
    try {
      response = await fetcher(origin + path, { method, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json', 'User-Agent': 'FabCore/POC', ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch (caught) {
      const error = caught as { name?: string; cause?: { code?: string } };
      log(account.id, 'http-network', { elapsedMs: now() - start, timeout: error?.name === 'TimeoutError',
        reason: ['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(error?.cause?.code ?? '') ? error.cause?.code : 'network' });
      fail('cloud-unavailable');
    }
    log(account.id, 'http-headers', { status: response.status, elapsedMs: now() - start });
    let data: CloudResponse | null = null; let bodyBytes = 0;
    // Bound provider responses before parsing; only sanitized JSON is logged.
    try {
      if (response.body) {
        const reader = response.body.getReader(); let size = 0; const chunks: Buffer[] = [];
        try {
          for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 1024 * 1024) fail('cloud-response'); chunks.push(Buffer.from(item.value)); }
          bodyBytes = size;
          if (size) { try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* HTML challenges are reported by HTTP status. */ } }
        } finally { await reader.cancel().catch(() => {}); }
      }
    } catch (error) { if (error instanceof CloudError) throw error; fail('cloud-unavailable'); }
    if (signal?.aborted) fail('cloud-unavailable');
    log(account.id, 'http-result', { method, path, status: response.status, elapsedMs: now() - start,
      contentType: response.headers.get('content-type')?.includes('json') ? 'json' : 'other',
      code: safeCode(data?.code), loginType: (data?.loginType === 'verifyCode' || data?.loginType === 'tfa') ? data.loginType : undefined,
      tokenPresent: Boolean(data?.accessToken), deviceCount: Array.isArray(data?.devices) ? data.devices.length : undefined,
      bodyBytes, response: safeCloudPayload(data, [...secrets, data?.accessToken, data?.tfaKey]),
      retryAfter: /^\d{1,6}$/.test(response.headers.get('retry-after') ?? '') ? Number(response.headers.get('retry-after')) : undefined });
    if (response.status === 429) fail('cloud-rate', 429);
    if (response.status === 401) fail('cloud-auth', 401);
    if (response.status === 403) fail('cloud-access', 403);
    if (response.status === 400 && data?.code === 1) fail('cloud-code-expired', 400);
    if (response.status === 400 && data?.code === 2) fail('cloud-code', 400);
    if (!response.ok) fail(response.status === 400 ? 'cloud-auth' : 'cloud-unavailable', response.status === 400 ? 400 : 502);
    if (!cookies && (!data || typeof data !== 'object' || Array.isArray(data))) fail('cloud-response');
    return { data: data as CloudResponse, headers: response.headers };
  }
  function cookie(headers: Headers, name: string) {
    const values = headers.getSetCookie?.() ?? [];
    const value = values.find(item => item.startsWith(name + '='))?.split(';')[0]?.slice(name.length + 1);
    return value && /^[A-Za-z0-9._~%+/-]{1,16384}$/.test(value) ? value : null;
  }
  async function devices(account: CloudAccount, token: string, signal?: AbortSignal) {
    const { data } = await request(account, bases(account).api, '/v1/iot-service/api/user/bind', { token, signal });
    if (!Array.isArray(data.devices)) fail('cloud-response');
    const seen = new Set<string>();
    const list = data.devices.slice(0, 200).flatMap(item => {
      const serial = text(item.dev_id, 64);
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(serial) || seen.has(serial)) return [];
      seen.add(serial);
      return [{ serial, name: text(item.name, 120) || serial, model: text(item.dev_product_name, 120) || text(item.dev_model_name, 120),
        online: typeof item.online === 'boolean' ? item.online : null, status: text(item.print_status, 40) }];
    });
    log(account.id, 'devices-read', { count: list.length, truncated: data.devices.length > 200, devices: list });
    return { devices: list, truncated: data.devices.length > 200, checkedAt: new Date(now()).toISOString(), issue: null };
  }
  return {
    bases,
    devices,
    async cameraCodes(account: CloudAccount, token: string, signal?: AbortSignal): Promise<Map<string, string>> {
      const { data } = await request(account, bases(account).api, '/v1/iot-service/api/user/bind', { token, signal });
      if (!Array.isArray(data.devices)) fail('camera-credentials');
      const codes = new Map<string, string>();
      for (const device of data.devices.slice(0, 200)) {
        if (typeof device.dev_id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(device.dev_id) && typeof device.dev_access_code === 'string' && /^[A-Za-z0-9]{8}$/.test(device.dev_access_code)) codes.set(device.dev_id, device.dev_access_code);
      }
      return codes;
    },
    async login(account: CloudAccount, password: string, signal?: AbortSignal) {
      const { data } = await request(account, bases(account).api, '/v1/user-service/user/login', {
        method: 'POST', body: { account: account.email, password, apiError: '' }, signal });
      return data;
    },
    async verify(account: CloudAccount, flow: { kind: string; tfaKey?: string }, code: string, signal?: AbortSignal) {
      const { api, portal } = bases(account);
      if (flow.kind === 'email') {
        const result = await request(account, api, '/v1/user-service/user/login', {
          method: 'POST', body: { account: account.email, code }, signal });
        return result.data.accessToken;
      }
      const csrf = await request(account, portal, '/api/csrf', { cookies: true, signal });
      const csrfToken = cookie(csrf.headers, 'bbl_csrf_token');
      if (!csrfToken) fail('cloud-challenge');
      const result = await request(account, portal, '/api/sign-in/tfa', { method: 'POST', cookies: true, signal,
        headers: { 'x-bbl-csrf-token': csrfToken, Cookie: 'bbl_csrf_token=' + csrfToken }, body: { tfaKey: flow.tfaKey, tfaCode: code } });
      return cookie(result.headers, 'token') ?? result.data?.accessToken;
    },
    async mqttUsername(account: CloudAccount, token: string) {
      let username: unknown;
      try { username = (JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { username?: unknown }).username; }
      catch { /* Opaque tokens use the preference endpoint. */ }
      if (typeof username === 'string' && /^u_\d{1,30}$/.test(username)) return username;
      const { data } = await request(account, bases(account).api, '/v1/design-user-service/my/preference', { token });
      if (!/^\d{1,30}$/.test(String(data.uid ?? ''))) fail('cloud-response');
      return 'u_' + String(data.uid);
    },
  };
}
