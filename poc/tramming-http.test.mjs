import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFabCore } from './server.mjs';
import { openStore } from './store.mjs';

const id = '11111111-1111-4111-8111-111111111111';
test('HTTP nivellement 4 points : droits, confirmation, ordre des points, planéité enregistrée et exposée', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-tramming-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = openStore(directory); store.save({ ...store.state, machines: [{ id, name: 'Ender', kind: 'klipper', origin: 'http://192.168.1.20:7125', apiKey: 'test-key' }] });
  const heights = [1.5, 1.62, 1.41, 1.5]; let probes = 0, last = 0; const scripts = [];
  const native = async (url, options) => {
    assert.equal(new Headers(options.headers).get('X-Api-Key'), 'test-key');
    if (url.includes('/printer/objects/query?configfile')) return Response.json({ result: { status: { configfile: { settings: { bltouch: { x_offset: -41.5, y_offset: -7 } } }, toolhead: { homed_axes: 'xyz', axis_minimum: [0, 0, -2], axis_maximum: [220, 220, 250] }, print_stats: { state: 'standby' }, webhooks: { state: 'ready' } } } });
    if (url.endsWith('/printer/objects/query?probe')) return Response.json({ result: { status: { probe: { last_z_result: last } } } });
    if (url.endsWith('/printer/gcode/script')) { const script = JSON.parse(options.body).script; scripts.push(script); if (script.endsWith('PROBE')) last = heights[probes++]; return Response.json({ result: 'ok' }); }
    throw new Error('unexpected fixture request ' + url);
  };
  const { server, token } = createFabCore({ store, directory, origin: 'http://fabcore.test', fetchFiles: native, readPrinter: async () => ({ status: 'ready', file: '', progress: 0, issue: null, nozzle: 20, bed: 60 }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const call = (path, body, cookie) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method: body === undefined ? 'GET' : 'POST', headers: { Host: 'fabcore.test', Origin: 'http://fabcore.test', ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk); const text = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const admin = (await call('/api/setup', { username: 'admin', password: 'test-tramming-password', token })).headers['set-cookie'][0].split(';')[0];
  await call('/api/observers', { username: 'viewer', password: 'tramming-viewer-password' }, admin);
  const observer = (await call('/api/login', { username: 'viewer', password: 'tramming-viewer-password' })).headers['set-cookie'][0].split(';')[0];
  const path = '/api/machines/' + id + '/tramming';
  assert.equal((await call(path)).status, 401);
  assert.equal((await call(path, undefined, observer)).status, 403);
  const geometry = await call(path, undefined, admin);
  assert.equal(geometry.body.available, true); assert.equal(geometry.body.points.length, 4); assert.equal(geometry.body.last, null);
  assert.equal((await call(path, { point: 0 }, admin)).status, 400, 'confirmation obligatoire');
  assert.equal((await call(path, { point: 0, confirm: true }, observer)).status, 403);
  assert.equal((await call(path, { point: 1, confirm: true }, admin)).status, 409, 'une passe commence au point 1');
  assert.equal(scripts.length, 0);
  for (const point of [0, 1, 2]) assert.equal((await call(path, { point, confirm: true }, admin)).body.measure.corner, ['front-left', 'front-right', 'back-right'][point]);
  const final = await call(path, { point: 3, confirm: true }, admin);
  assert.equal(final.body.result.range, 0.21); assert.deepEqual(final.body.result.deviations.map(item => item.delta), [0, 0.12, -0.09, 0]);
  assert.equal(scripts.at(-1), 'G90\nG1 Z10 F600', 'buse remontée après la dernière mesure');
  assert.equal(scripts.filter(script => script.endsWith('PROBE')).length, 4, 'un palpage par point, aucun rejeu');
  assert.equal((await call(path, undefined, admin)).body.last.range, 0.21, 'planéité enregistrée');
  const fleet = await call('/api/machines', undefined, admin);
  assert.equal(fleet.body.machines[0].bedLevel.range, 0.21, 'planéité exposée dans le parc');
});
