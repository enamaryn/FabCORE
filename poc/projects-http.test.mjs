import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFabCore } from './server.mjs';
import { openStore } from './store.mjs';

test('HTTP projets : lecture/écriture selon rôle, origine, taille, concurrence et persistance sans commande machine', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-projects-http-')); t.after(() => rm(directory, { recursive: true, force: true }));
  let machineCalls = 0;
  const { server, token } = createFabCore({ directory, origin: 'http://fabcore.test', readPrinter: () => { machineCalls++; throw new Error('unexpected-machine'); }, sendCommand: () => { machineCalls++; throw new Error('unexpected-command'); } });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const call = (path, body, cookie, origin = 'http://fabcore.test') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method: body === undefined ? 'GET' : 'POST', headers: { Host: 'fabcore.test', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk); resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks)) });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  assert.equal((await call('/api/projects')).status, 401);
  const setup = await call('/api/setup', { username: 'atelier', password: 'project-test-password', token }); const admin = setup.headers['set-cookie'][0].split(';')[0];
  await call('/api/observers', { username: 'viewer', password: 'project-viewer-password' }, admin);
  const observer = (await call('/api/login', { username: 'viewer', password: 'project-viewer-password' })).headers['set-cookie'][0].split(';')[0];
  assert.equal((await call('/api/projects', { title: 'Denied' }, observer)).status, 403);
  assert.equal((await call('/api/projects', { title: 'Denied' }, admin, 'http://foreign.test')).status, 403);
  const created = await call('/api/projects', { title: 'Conception client', origin: 'client', client: 'A', format: 'mixed', notes: 'x'.repeat(5000), links: [{ label: 'Design', url: 'https://example.test/model.step', kind: 'design' }] }, admin);
  assert.equal(created.status, 200, 'brief supérieur à 4 Kio accepté uniquement par le plugin projets'); const id = created.body.id;
  assert.equal((await call('/api/projects', undefined, observer)).body.projects[0].id, id);
  assert.equal((await call('/api/projects/' + id, { expectedRevision: 1, stage: 'design' }, admin)).body.stage, 'design');
  const conflict = await call('/api/projects/' + id, { expectedRevision: 1, stage: 'final' }, admin); assert.equal(conflict.status, 409); assert.equal(conflict.body.error, 'project-conflict');
  const work = await call('/api/projects/' + id + '/work', { title: 'Prototype 3D', kind: 'prototype', format: '3d', quantity: 2 }, admin); assert.equal(work.status, 200);
  assert.equal((await call('/api/projects/' + id + '/work/' + work.body.id, { expectedRevision: 1, state: 'done' }, observer)).status, 403);
  assert.equal((await call('/api/projects', { title: 'oversized', notes: 'x'.repeat(70000) }, admin)).status, 400);
  const persisted = openStore(directory).state.projectBoard; assert.equal(persisted.projects[0].stage, 'design'); assert.equal(persisted.work[0].quantity, 2);
  assert.equal(machineCalls, 0);
  const restored = await call('/api/projects', undefined, admin); assert.equal(restored.body.work[0].projectId, id);
});
