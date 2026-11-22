import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CloudError, createCloudHttp, safeCloudPayload } from '../src/cloud-http.ts';

const account = { id: 'one', provider: 'bambu', region: 'china', email: 'test@example.com' };

test('Cloud HTTP autonome : email puis inventaire filtré, sans seconde demande de code ni secret journalisé', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const logs: unknown[] = [];
  const http = createCloudHttp({ now: () => 1000, log: (...args) => { logs.push(args); }, fetcher: async (url, init) => {
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    if (body.password) return Response.json({ loginType: 'verifyCode', diagnostic: 'PASSWORD' });
    if (body.code) return Response.json({ accessToken: 'TOKEN' });
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer TOKEN');
    return Response.json({ devices: [
      { dev_id: 'TEST', name: ' A ', dev_model_name: 'P2S', online: true, dev_access_code: 'LAN_SECRET' },
      { dev_id: 'TEST', name: 'duplicate' }, { dev_id: '../foreign' },
    ] });
  } });
  assert.equal((await http.login(account, 'PASSWORD')).loginType, 'verifyCode');
  assert.equal(await http.verify(account, { kind: 'email' }, '123456'), 'TOKEN');
  const inventory = await http.devices(account, 'TOKEN');
  assert.deepEqual(inventory.devices, [{ serial: 'TEST', name: 'A', model: 'P2S', online: true, status: '' }]);
  assert.equal(inventory.checkedAt, new Date(1000).toISOString());
  assert.ok(calls.every(item => item.url.startsWith('https://api.bambulab.cn/')));
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[1]?.body, { account: account.email, code: '123456' });
  assert.doesNotMatch(JSON.stringify(logs), /PASSWORD|123456|TOKEN|LAN_SECRET/);
});

test('Cloud HTTP autonome : TOTP CSRF, cookies sélectionnés et identité JWT ou opaque', async () => {
  const calls: string[] = []; const logs: unknown[] = [];
  const http = createCloudHttp({ log: (...args) => { logs.push(args); }, fetcher: async (url, init) => {
    calls.push(String(url));
    if (String(url).endsWith('/api/csrf')) return new Response(null, { status: 204, headers: { 'Set-Cookie': 'bbl_csrf_token=CSRF_SECRET; Secure' } });
    if (String(url).endsWith('/sign-in/tfa')) {
      assert.deepEqual(JSON.parse(String(init?.body)), { tfaKey: 'TFA_SECRET', tfaCode: '654321' });
      assert.equal((init?.headers as Record<string, string>).Cookie, 'bbl_csrf_token=CSRF_SECRET');
      return Response.json({}, { headers: { 'Set-Cookie': 'token=TOKEN_SECRET; Secure' } });
    }
    return Response.json({ uid: '42' });
  } });
  assert.equal(await http.verify(account, { kind: 'totp', tfaKey: 'TFA_SECRET' }, '654321'), 'TOKEN_SECRET');
  const jwt = 'x.' + Buffer.from(JSON.stringify({ username: 'u_7' })).toString('base64url') + '.x';
  assert.equal(await http.mqttUsername(account, jwt), 'u_7');
  assert.equal(calls.length, 2, 'décodage JWT sans nouvelle requête');
  assert.equal(await http.mqttUsername(account, 'OPAQUE_SECRET'), 'u_42');
  assert.doesNotMatch(JSON.stringify(logs), /CSRF_SECRET|TFA_SECRET|TOKEN_SECRET|OPAQUE_SECRET|654321/);
});

test('Cloud HTTP autonome : erreurs typées, plafond réponse, annulation et aucun rejeu', async () => {
  for (const [status, payload, code] of [
    [401, {}, 'cloud-auth'], [403, {}, 'cloud-access'], [429, {}, 'cloud-rate'],
    [400, { code: 1 }, 'cloud-code-expired'], [400, { code: 2 }, 'cloud-code'],
    [200, [], 'cloud-response'],
  ] as const) {
    let calls = 0;
    const http = createCloudHttp({ log() {}, fetcher: async () => { calls++; return Response.json(payload, { status }); } });
    await assert.rejects(http.login(account, 'SECRET'), (error: unknown) => error instanceof CloudError && error.message === code);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const http = createCloudHttp({ log() {}, fetcher: async () => { calls++; return new Response('x'.repeat(1024 * 1024 + 1)); } });
  await assert.rejects(http.login(account, 'SECRET'), /cloud-response/);
  await assert.rejects(http.login(account, 'SECRET', AbortSignal.abort()), /cloud-unavailable/);
  assert.equal(calls, 1);
  assert.throws(() => http.bases({ ...account, provider: 'other' }), /cloud-unsupported/);
});

test('Masquage cloud partagé : champs inconnus conservés, secrets et clés dangereuses exclus', () => {
  const payload = JSON.parse('{"__proto__":{"polluted":true},"custom":"value","nested":{"token":"SECRET","message":"Bearer SECRET"}}') as unknown;
  assert.deepEqual(safeCloudPayload(payload, ['SECRET']), { custom: 'value', nested: { token: '[redacted]', message: 'Bearer [redacted]' } });
});
