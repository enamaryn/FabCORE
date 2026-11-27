import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFabCore } from './server.mjs';
import { openStore } from './store.mjs';

test('HTTP réalisé : association native explicite, droits, clôture et redémarrage du stockage', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-executions-http-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const machineId = '11111111-1111-4111-8111-111111111111';
  const store = openStore(directory); store.save({ ...store.state, machines: [{ id: machineId, kind: 'klipper', name: 'Test', origin: 'http://printer.invalid' }] });
  let reads = 0, writes = 0;
  const { server, token } = createFabCore({ directory, store, origin: 'http://fabcore.test', readPrinter: async () => { reads++; return { status: 'printing', file: 'test.gcode', progress: 10, nozzle: 20, bed: 20 }; }, sendCommand: async () => { writes++; throw new Error('unexpected-command'); }, fetchFiles: async () => Response.json({ result: { webcams: [] } }) });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const call = (path, body, cookie, origin = 'http://fabcore.test') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method: body === undefined ? 'GET' : 'POST', headers: { Host: 'fabcore.test', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk); resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks)) });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const setup = await call('/api/setup', { username: 'atelier', password: 'executions-test-password', token }); const admin = setup.headers['set-cookie'][0].split(';')[0];
  await call('/api/observers', { username: 'viewer', password: 'executions-viewer-password' }, admin);
  const observer = (await call('/api/login', { username: 'viewer', password: 'executions-viewer-password' })).headers['set-cookie'][0].split(';')[0];
  const work = (await call('/api/production/work', { title: 'Commande', machineId, estimatedMinutes: 20 }, admin)).body;
  const start = { expectedRevision: 1, mode: 'observed', file: 'test.gcode', confirm: true };
  const endpoint = '/api/production/work/' + work.id;
  assert.equal((await call(endpoint + '/execution', start, observer)).status, 403);
  assert.equal((await call(endpoint + '/execution', start, admin, 'http://foreign.test')).status, 403);
  assert.equal(reads, 0, 'aucune lecture du matériel avant les gardes');
  const linked = await call(endpoint + '/execution', start, admin); assert.equal(linked.status, 200);
  assert.equal(linked.body.executions[0].startedAt, null); assert.equal(linked.body.executions[0].file, 'test.gcode'); assert.equal(reads, 1);
  assert.equal((await call(endpoint, { expectedRevision: 2, state: 'done' }, admin)).status, 409);
  const executionId = linked.body.executions[0].id;
  const finished = await call(endpoint + '/execution/' + executionId + '/finish', { expectedRevision: 2, confirm: true, outcome: 'done', endedAt: new Date().toISOString() }, admin);
  assert.equal(finished.status, 200); assert.equal(finished.body.state, 'done');
  assert.equal(finished.body.executions[0].startedAt, null, 'heure inconnue non inventée');
  assert.equal((await call(endpoint + '/replan-preview', { expectedRevision: 3 }, observer)).status, 403);
  const persisted = openStore(directory).state.projectBoard.work[0];
  assert.equal(persisted.executions[0].outcome, 'done'); assert.equal(writes, 0);
});
