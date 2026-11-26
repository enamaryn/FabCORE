import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFabCore } from './server.mjs';
import { openStore } from './store.mjs';

test('HTTP production autonome : aucun projet requis, rôle, origine, révisions et stockage partagé', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-production-http-')); t.after(() => rm(directory, { recursive: true, force: true }));
  let machineCalls = 0;
  const { server, token } = createFabCore({ directory, origin: 'http://fabcore.test', readPrinter: () => { machineCalls++; throw new Error('unexpected-machine'); }, sendCommand: () => { machineCalls++; throw new Error('unexpected-command'); } });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const call = (path, body, cookie, origin = 'http://fabcore.test') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method: body === undefined ? 'GET' : 'POST', headers: { Host: 'fabcore.test', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk); resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks)) });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  assert.equal((await call('/api/production')).status, 401);
  const setup = await call('/api/setup', { username: 'atelier', password: 'production-test-password', token }); const admin = setup.headers['set-cookie'][0].split(';')[0];
  await call('/api/observers', { username: 'viewer', password: 'production-viewer-password' }, admin);
  const observer = (await call('/api/login', { username: 'viewer', password: 'production-viewer-password' })).headers['set-cookie'][0].split(';')[0];
  assert.equal((await call('/api/production/work', { title: 'Denied' }, observer)).status, 403);
  assert.equal((await call('/api/production/work', { title: 'Denied' }, admin, 'http://foreign.test')).status, 403);
  const direct = await call('/api/production/work', { title: 'Commande sans Kanban', client: 'Client A', quantity: 3, notes: 'Test' }, admin);
  assert.equal(direct.status, 200); assert.equal(direct.body.projectId, null); const id = direct.body.id;
  const board = await call('/api/production', undefined, observer); assert.equal(board.status, 200); assert.equal(board.body.projects.length, 0); assert.equal(board.body.work[0].id, id);
  assert.equal((await call('/api/production/work/' + id, { expectedRevision: 1, notes: 'Modifié' }, admin)).body.revision, 2);
  assert.equal((await call('/api/production/work/' + id, { expectedRevision: 1, notes: 'Périmé' }, admin)).status, 409);
  assert.equal((await call('/api/production/work/' + id, { expectedRevision: 2, scheduledStart: '2026-11-27T08:00:00Z' }, admin)).status, 400);
  assert.equal((await call('/api/production/work/' + id, { expectedRevision: 2, state: 'done' }, observer)).status, 403);
  const parent = await call('/api/projects', { title: 'Projet optionnel' }, admin);
  const linked = await call('/api/projects/' + parent.body.id + '/work', { title: 'Du Kanban' }, admin);
  const combined = await call('/api/production', undefined, admin); assert.equal(combined.body.work.length, 2);
  assert.equal((await call('/api/production/work/' + linked.body.id, { expectedRevision: 1, notes: 'Depuis le planning' }, admin)).body.projectId, parent.body.id);
  const restored = openStore(directory).state.projectBoard; assert.equal(restored.work.length, 2); assert.equal(restored.work[0].client, 'Client A'); assert.equal(restored.work[0].projectId, null);
  assert.equal(machineCalls, 0);
});
