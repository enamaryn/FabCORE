import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFabCore } from './server.mjs';

function get(server, path, host = 'fabcore.test') {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, headers: { Host: host } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    }); req.on('error', reject); req.end();
  });
}
test('React HTTP : build servi sans CDN, assets confinés, shell public et API authentifiée', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-react-http-'));
  const { server } = createFabCore({ directory, origin: 'http://fabcore.test', readPrinter: () => assert.fail('Aucune lecture matérielle') });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const page = await get(server, '/app'); assert.equal(page.status, 200); assert.match(page.body, /id="root"/);
  assert.equal(page.headers['cache-control'], 'no-store'); assert.doesNotMatch(page.body, /https?:\/\//);
  const assets = [...page.body.matchAll(/(?:src|href)="(\/app\/assets\/[^"]+)"/g)].map(match => match[1]);
  assert.ok(assets.some(path => path.endsWith('.js'))); assert.ok(assets.some(path => path.endsWith('.css')));
  for (const path of assets) { const asset = await get(server, path); assert.equal(asset.status, 200, path); assert.equal(asset.headers['cache-control'], 'no-store'); assert.ok(asset.body.length > 0); }
  assert.equal((await get(server, '/api/machines')).status, 401);
  assert.equal((await get(server, '/app', 'evil.test')).status, 421);
  for (const path of ['/app?debug=1', '/app/assets/../../package.json', '/app/assets/missing.js', '/app/assets/missing.js?x=1', '/?screen=invalid', '/?machine=invalid', '/?screen=add&x=1']) assert.equal((await get(server, path)).status, 404, path);
  assert.equal((await get(server, '/?screen=add')).status, 200);
  assert.equal((await get(server, '/?screen=cloud')).status, 200);
  assert.equal((await get(server, '/?machine=11111111-1111-4111-8111-111111111111')).status, 200);
});
