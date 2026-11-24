// Parité du routage complet : chaînes de requête, replis 404/405, ordre des refus et en-têtes, contre le vrai serveur.
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFabCore } from './server.mjs';

const origin = 'http://fabcore.test';
const unknownId = '00000000-0000-0000-0000-000000000000';
async function start(ctx) {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-routing-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  const { server, token } = createFabCore({ directory, origin, activationToken: 'routing-activation',
    fetchFiles: async url => {
      assert.equal(new URL(url).pathname, '/server/webcams/list');
      return Response.json({ result: { webcams: [] } });
    },
    readPrinter: async () => ({ status: 'ready', issue: null, progress: 0, nozzle: 20, bed: 20, file: '' }) });
  ctx.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const send = (path, { method = 'GET', raw, body, cookie, requestOrigin = origin, type } = {}) => new Promise((resolve, reject) => {
    const payload = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    const contentType = type ?? (payload === undefined ? undefined : 'application/json');
    const req = request(base + path, { method, headers: { Host: 'fabcore.test', Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(contentType ? { 'Content-Type': contentType } : {}) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch { json = undefined; }
      resolve({ status: res.statusCode, json, text, headers: res.headers });
    });
    req.on('error', reject); req.end(payload);
  });
  const login = async body => (await send(body.token ? '/api/setup' : '/api/login', { method: 'POST', body })).headers['set-cookie'][0].split(';')[0];
  const admin = await login({ username: 'atelier', password: 'long-enough-password', token });
  await send('/api/observers', { method: 'POST', body: { username: 'lecture', password: 'observer-password' }, cookie: admin });
  const observer = await login({ username: 'lecture', password: 'observer-password' });
  const machine = (await send('/api/machines', { method: 'POST', body: { kind: 'klipper', name: 'Voron', origin: 'http://192.168.1.20:7125' }, cookie: admin })).json.id;
  return { send, admin, observer, machine };
}
const result = response => [response.status, response.json];

test('routage : chaînes de requête, pages statiques, HEAD et routes inconnues', async ctx => {
  const { send, admin } = await start(ctx);
  const page = await send('/');
  assert.equal(page.status, 303);
  assert.equal(page.headers.location, '/app');
  assert.equal(page.headers['x-content-type-options'], 'nosniff');
  assert.match(page.headers['content-security-policy'], /default-src 'self'/);
  const oidc = await send('/?auth=oidc-failed'); assert.equal(oidc.status, 303); assert.equal(oidc.headers.location, '/app#oidc-failed');
  assert.deepEqual(result(await send('/?x=1')), [404, { error: 'missing' }]);
  assert.equal((await send('/live.js')).status, 200);
  assert.deepEqual(result(await send('/live.js?v=2')), [404, { error: 'missing' }]);
  assert.equal((await send('/', { method: 'HEAD' })).status, 404);
  assert.deepEqual(result(await send('/api/session?x=1')), [404, { error: 'missing' }]);
  assert.deepEqual(result(await send('/api/machines?x=1', { cookie: admin })), [404, { error: 'missing' }]);
  assert.deepEqual(result(await send('/api/inconnue')), [404, { error: 'missing' }]);
  assert.deepEqual(result(await send('/api/inconnue', { method: 'POST', raw: '{' })), [404, { error: 'missing' }], 'corps invalide sur route inconnue : 404');
  assert.deepEqual(result(await send('/api/session', { method: 'DELETE' })), [404, { error: 'missing' }]);
  const missing = await send('/api/inconnue');
  assert.equal(missing.headers['cache-control'], 'no-store', 'en-têtes de sécurité sur le repli');
  assert.deepEqual(result(await send('/api/oidc/start')), [404, { error: 'missing' }], 'OIDC désactivé');
  assert.deepEqual(result(await send('/api/oidc/callback?code=x')), [404, { error: 'missing' }]);
});

test('routage : replis 405 et ordre des refus des comptes cloud', async ctx => {
  const { send, admin, observer } = await start(ctx);
  assert.deepEqual(result(await send('/api/cloud-accounts', { method: 'PUT' })), [401, { error: 'sign-in' }]);
  assert.deepEqual(result(await send('/api/cloud-accounts', { method: 'PUT', cookie: observer })), [403, { error: 'forbidden' }]);
  assert.deepEqual(result(await send('/api/cloud-accounts', { method: 'PUT', cookie: admin })), [405, { error: 'missing' }]);
  assert.deepEqual(result(await send(`/api/cloud-accounts/${unknownId}/login`, { cookie: admin })), [405, { error: 'missing' }]);
  assert.deepEqual(result(await send(`/api/cloud-accounts/${unknownId}/logs`, { method: 'POST', body: {}, cookie: admin })), [405, { error: 'missing' }]);
  assert.deepEqual(result(await send('/api/cloud-accounts', { method: 'POST', body: {}, cookie: admin, requestOrigin: 'http://evil.test' })), [403, { error: 'origin' }]);
  assert.deepEqual(result(await send('/api/cloud-accounts', { method: 'POST', raw: '{', cookie: admin })), [400, { error: 'invalid' }]);
  assert.deepEqual(result(await send('/api/cloud-accounts', { method: 'POST', body: { provider: 'inconnu' }, cookie: admin })), [400, { error: 'cloud-invalid' }]);
  assert.deepEqual(result(await send(`/api/cloud-accounts/${unknownId}/devices`, { method: 'POST', body: {}, cookie: admin })), [404, { error: 'missing' }]);
  assert.deepEqual(result(await send('/api/notifications', { method: 'PUT', cookie: admin })), [405, { error: 'missing' }]);
  assert.deepEqual(result(await send('/api/discovery', { method: 'DELETE', cookie: admin })), [405, { error: 'missing' }]);
});

test('routage : commandes, contrôles, terminal et caméras', async ctx => {
  const { send, admin, observer, machine } = await start(ctx);
  const command = `/api/machines/${machine}/command`;
  assert.deepEqual(result(await send(command, { method: 'POST', body: { action: 'pause' } })), [401, { error: 'sign-in' }]);
  assert.deepEqual(result(await send(command, { method: 'POST', raw: '{', cookie: observer })), [403, { error: 'forbidden' }]);
  assert.deepEqual(result(await send(command, { method: 'POST', body: { action: 'pause' }, cookie: admin, requestOrigin: 'http://evil.test' })), [403, { error: 'origin' }]);
  assert.deepEqual(result(await send(command, { method: 'POST', body: { action: 'home' }, cookie: admin })), [400, { error: 'invalid' }]);
  assert.deepEqual(result(await send(`/api/machines/${unknownId}/command`, { method: 'POST', body: { action: 'pause' }, cookie: admin })), [404, { error: 'missing' }]);
  assert.deepEqual(result(await send(command, { method: 'POST', body: { action: 'stop' }, cookie: admin })), [400, { error: 'invalid' }], 'arrêt sans confirmation');
  assert.deepEqual(result(await send(command, { method: 'POST', body: { action: 'pause' }, cookie: admin })), [409, { error: 'command-state' }], 'pause refusée hors fabrication');
  assert.deepEqual(result(await send(command, { cookie: admin })), [404, { error: 'missing' }], 'GET : repli 404');
  const controls = `/api/machines/${machine}/controls`;
  assert.deepEqual(result(await send(controls)), [401, { error: 'sign-in' }]);
  assert.deepEqual(result(await send(`/api/machines/${unknownId}/controls`, { cookie: observer })), [404, { error: 'missing' }]);
  assert.deepEqual(result(await send(controls, { method: 'POST', body: {}, cookie: observer })), [403, { error: 'forbidden' }]);
  assert.deepEqual(result(await send(controls, { method: 'PUT', cookie: admin })), [404, { error: 'missing' }]);
  const gcode = `/api/machines/${machine}/gcode`;
  assert.deepEqual(result(await send(gcode, { method: 'POST', body: { command: 'M105' } })), [401, { error: 'sign-in' }]);
  assert.deepEqual(result(await send(gcode, { method: 'POST', body: { command: '' }, cookie: admin })), [400, { error: 'invalid' }]);
  assert.deepEqual(result(await send(`/api/machines/${machine}/camera`)), [401, { error: 'sign-in' }]);
  assert.deepEqual(result(await send(`/api/machines/${machine}/camera`, { cookie: observer })), [502, { error: 'camera-unavailable' }], 'Klipper sans caméra déclarée (comportement voulu depuis l’audit LAN)');
  assert.deepEqual(result(await send(`/api/machines/${unknownId}/camera/preview/side`, { cookie: observer })), [404, { error: 'camera-unsupported' }]);
});

test('routage : fichiers, ordre des refus et méthodes inattendues', async ctx => {
  const { send, admin, observer, machine } = await start(ctx);
  const files = `/api/machines/${machine}/files`;
  assert.deepEqual(result(await send(files)), [401, { error: 'sign-in' }]);
  assert.deepEqual(result(await send(`/api/machines/${unknownId}/files`, { cookie: observer })), [404, { error: 'missing' }]);
  assert.deepEqual(result(await send(`/api/machines/${machine}/file?path=..%2Fx.gcode`, { cookie: observer })), [400, { error: 'invalid' }]);
  assert.deepEqual(result(await send(files + '?name=a.gcode', { method: 'POST', raw: 'G28', type: 'application/octet-stream', cookie: observer })), [403, { error: 'forbidden' }]);
  assert.deepEqual(result(await send(files + '?name=a.gcode', { method: 'POST', raw: 'G28', type: 'application/octet-stream', cookie: admin, requestOrigin: 'http://evil.test' })), [403, { error: 'origin' }]);
  assert.deepEqual(result(await send(files + '?name=a.gcode', { method: 'POST', raw: 'G28', type: 'text/plain', cookie: admin })), [400, { error: 'invalid' }]);
  assert.deepEqual(result(await send(files + '?name=..%2Fa.gcode', { method: 'POST', raw: 'G28', type: 'application/octet-stream', cookie: admin })), [400, { error: 'invalid' }]);
  assert.deepEqual(result(await send(`/api/machines/${machine}/print`, { method: 'POST', body: { path: 'a.gcode' }, cookie: admin })), [400, { error: 'invalid' }], 'lancement sans confirmation');
  assert.deepEqual(result(await send(`/api/machines/${machine}/transfer`, { method: 'POST', body: { path: 'a.gcode' }, cookie: admin })), [400, { error: 'invalid' }]);
  assert.deepEqual(result(await send(files, { method: 'PUT' })), [401, { error: 'sign-in' }]);
  assert.deepEqual(result(await send(files, { method: 'PUT', cookie: observer })), [403, { error: 'forbidden' }]);
  assert.deepEqual(result(await send(files, { method: 'PUT', cookie: admin })), [404, { error: 'missing' }]);
});
