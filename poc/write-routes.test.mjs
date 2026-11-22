// Parité des écritures comptes/notifications : ordre des refus, codes et en-têtes, contre le vrai serveur.
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFabCore } from './server.mjs';

const origin = 'http://fabcore.test';
async function start(ctx, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-writes-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  const { server, token } = createFabCore({ directory, origin, activationToken: 'write-routes-activation', notify: async () => false, ...options });
  ctx.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const send = (path, { raw, body, cookie, requestOrigin = origin, type = 'application/json', method = 'POST' } = {}) => new Promise((resolve, reject) => {
    const payload = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    const req = request(base + path, { method, headers: { Host: 'fabcore.test', ...(requestOrigin ? { Origin: requestOrigin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(type ? { 'Content-Type': type } : {}) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString();
      resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null });
    });
    req.on('error', reject); req.end(payload);
  });
  return { send, token };
}
const cookieOf = response => response.headers['set-cookie'][0].split(';')[0];

test('écritures : origine, type de contenu et corps JSON refusés comme avant', async ctx => {
  const { send } = await start(ctx);
  assert.deepEqual(await send('/api/login', { body: {}, requestOrigin: 'http://evil.test' }).then(r => [r.status, r.body]), [403, { error: 'origin' }]);
  assert.deepEqual(await send('/api/login', { body: {}, requestOrigin: null }).then(r => [r.status, r.body]), [403, { error: 'origin' }]);
  assert.deepEqual(await send('/api/login', { raw: '{}', type: 'text/plain' }).then(r => [r.status, r.body]), [415, { error: 'invalid' }]);
  assert.deepEqual(await send('/api/login', { raw: '{}', type: null }).then(r => [r.status, r.body]), [415, { error: 'invalid' }]);
  assert.equal((await send('/api/login', { raw: '{}', type: 'application/json; charset=utf-8' })).status, 401, 'paramètre charset accepté');
  for (const raw of ['{', '[]', 'null', '"texte"', '', JSON.stringify({ username: 'x'.repeat(5000) })]) {
    assert.deepEqual(await send('/api/setup', { raw }).then(r => [r.status, r.body]), [400, { error: 'invalid' }], `corps refusé : ${raw.slice(0, 12)}`);
  }
  assert.deepEqual(await send('/api/login', { method: 'GET', type: null }).then(r => [r.status, r.body]), [404, { error: 'missing' }], 'GET reste refusé par le POC');
});

test('installation : jeton, identifiants, puis 409 avant lecture du corps une fois installé', async ctx => {
  const { send, token } = await start(ctx);
  assert.deepEqual((await send('/api/setup', { body: { username: 'atelier', password: 'long-enough-password', token: 'faux' } })).body, { error: 'token' });
  assert.deepEqual((await send('/api/setup', { body: { username: 'at', password: 'court', token } })).body, { error: 'credentials' });
  const created = await send('/api/setup', { body: { username: 'atelier', password: 'long-enough-password', token } });
  assert.equal(created.status, 200);
  assert.deepEqual(created.body, { authenticated: true, username: 'atelier', role: 'admin' });
  assert.match(created.headers['set-cookie'][0], /^fabcore_session=[\w-]{43}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=\d+$/);
  assert.deepEqual(await send('/api/setup', { raw: '{' }).then(r => [r.status, r.body]), [409, { error: 'installed' }], 'installé : 409 avant le corps invalide');
});

test('jeton expiré : 410', async ctx => {
  const { send, token } = await start(ctx);
  const realNow = Date.now;
  ctx.after(() => { Date.now = realNow; });
  Date.now = () => realNow() + 16 * 60_000;
  assert.deepEqual(await send('/api/setup', { body: { username: 'atelier', password: 'long-enough-password', token } }).then(r => [r.status, r.body]), [410, { error: 'expired' }]);
});

test('connexion : identifiants, rotation de session, déconnexion et limite partagée de tentatives', async ctx => {
  const { send, token } = await start(ctx);
  const admin = cookieOf(await send('/api/setup', { body: { username: 'atelier', password: 'long-enough-password', token } }));
  assert.deepEqual((await send('/api/login', { body: { username: 'atelier', password: 'mauvais-mot-de-passe' } })).body, { error: 'credentials' });
  const login = await send('/api/login', { body: { username: 'atelier', password: 'long-enough-password' }, cookie: admin });
  assert.deepEqual(login.body, { authenticated: true, username: 'atelier', role: 'admin' });
  assert.notEqual(cookieOf(login), admin);
  assert.equal((await send('/api/observers', { body: {}, cookie: admin })).status, 401, 'ancienne session révoquée à la connexion');
  const logout = await send('/api/logout', { body: {}, cookie: cookieOf(login) });
  assert.deepEqual(logout.body, { authenticated: false });
  assert.match(logout.headers['set-cookie'][0], /^fabcore_session=; .*Max-Age=0$/);
  assert.deepEqual((await send('/api/logout', { raw: '' })).body, { authenticated: false }, 'déconnexion sans corps ni session');
  let status = 0;
  for (let attempt = 0; attempt < 8 && status !== 429; attempt++) status = (await send('/api/login', { body: { username: 'x', password: 'y' } })).status;
  assert.deepEqual(await send('/api/login', { raw: '{' }).then(r => [r.status, r.body]), [429, { error: 'rate' }], 'limite atteinte : 429 avant le corps');
});

test('observateurs : droits avant corps, doublon, création 201', async ctx => {
  const { send, token } = await start(ctx);
  const admin = cookieOf(await send('/api/setup', { body: { username: 'atelier', password: 'long-enough-password', token } }));
  assert.deepEqual(await send('/api/observers', { raw: '{' }).then(r => [r.status, r.body]), [401, { error: 'sign-in' }]);
  assert.deepEqual(await send('/api/observers', { body: { username: 'atelier', password: 'long-enough-password' }, cookie: admin }).then(r => [r.status, r.body]), [409, { error: 'observer-duplicate' }]);
  const created = await send('/api/observers', { body: { username: 'lecture', password: 'observer-password' }, cookie: admin });
  assert.deepEqual([created.status, created.body], [201, { username: 'lecture' }]);
  const observer = cookieOf(await send('/api/login', { body: { username: 'lecture', password: 'observer-password' } }));
  assert.deepEqual(await send('/api/observers', { raw: '{', cookie: observer }).then(r => [r.status, r.body]), [403, { error: 'forbidden' }], 'observateur : 403 avant le corps invalide');
});

test('notifications : droits avant origine, test de canal et échec fournisseur sans détail', async ctx => {
  const { send, token } = await start(ctx);
  const admin = cookieOf(await send('/api/setup', { body: { username: 'atelier', password: 'long-enough-password', token } }));
  assert.deepEqual(await send('/api/notifications', { body: {}, requestOrigin: 'http://evil.test' }).then(r => [r.status, r.body]), [401, { error: 'sign-in' }], 'sans session : 401 avant l’origine');
  assert.deepEqual(await send('/api/notifications', { body: {}, cookie: admin, requestOrigin: 'http://evil.test' }).then(r => [r.status, r.body]), [403, { error: 'origin' }]);
  assert.deepEqual(await send('/api/notifications', { body: { ntfy: { mode: 'external', url: 'pas-une-url' } }, cookie: admin }).then(r => [r.status, r.body]), [400, { error: 'notifications-invalid' }]);
  assert.deepEqual(await send('/api/notifications/test', { body: { channel: 'sms' }, cookie: admin }).then(r => [r.status, r.body]), [400, { error: 'invalid' }]);
  assert.deepEqual(await send('/api/notifications/test', { body: { channel: 'ntfy' }, cookie: admin }).then(r => [r.status, r.body]), [502, { error: 'notifications-failed' }]);
  assert.deepEqual(await send('/api/notifications', { method: 'PUT', body: {}, cookie: admin }).then(r => [r.status, r.body]), [405, { error: 'missing' }], 'autres méthodes : 405 comme avant');
});
