import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFabCore } from './server.mjs';

test('HTTP catalogue des types de machines : administrateur seulement, sans compte cloud ni fonction', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-catalog-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const { server, token } = createFabCore({ directory, origin: 'http://fabcore.test', readPrinter: () => assert.fail('aucune lecture matérielle') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const call = (path, body, cookie) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method: body === undefined ? 'GET' : 'POST', headers: { Host: 'fabcore.test', Origin: 'http://fabcore.test', ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk); const text = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  assert.equal((await call('/api/connectors')).status, 401);
  const admin = (await call('/api/setup', { username: 'admin', password: 'test-catalog-password', token })).headers['set-cookie'][0].split(';')[0];
  await call('/api/observers', { username: 'viewer', password: 'catalog-viewer-password' }, admin);
  const observer = (await call('/api/login', { username: 'viewer', password: 'catalog-viewer-password' })).headers['set-cookie'][0].split(';')[0];
  assert.equal((await call('/api/connectors', undefined, observer)).status, 403);
  const { body } = await call('/api/connectors', undefined, admin);
  const kinds = body.connectors.map(item => item.kind);
  for (const kind of ['klipper', 'octoprint', 'prusalink', 'bambu', 'elegoo', 'elegoo-cc1', 'xtool-m2', 'longer-ray5']) assert.ok(kinds.includes(kind), kind);
  assert.ok(!kinds.includes('bambu-cloud'));
  assert.deepEqual(body.connectors.find(item => item.kind === 'klipper'), { kind: 'klipper', model: 'Klipper · Moonraker', form: 'http', port: 7125, required: false });
  assert.deepEqual(Object.keys(body.connectors[0]).sort(), ['form', 'kind', 'model', 'port', 'required']);
});
