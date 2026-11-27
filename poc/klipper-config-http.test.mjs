import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFabCore } from './server.mjs';
import { openStore } from './store.mjs';
const id = '11111111-1111-4111-8111-111111111111';
test('HTTP Klipper cfg : droits, téléchargement, sauvegarde confirmée et restart distinct sans commande réelle', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-config-http-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = openStore(directory); store.save({ ...store.state, machines: [{ id, name: 'Klipper test', kind: 'klipper', origin: 'http://192.168.1.20:7125', apiKey: 'test-key' }] });
  let contents = '[printer]\nmax_velocity: 200\n', restarts = 0, writes = 0, emergencies = 0, holdBackup = false;
  let releaseBackup, enteredBackup; const backupEntered = new Promise(resolve => { enteredBackup = resolve; }); const backupReleased = new Promise(resolve => { releaseBackup = resolve; });
  const native = async (url, options) => {
    assert.equal(new Headers(options.headers).get('X-Api-Key'), 'test-key');
    if (url.endsWith('/printer/info')) return Response.json({ result: { state: 'ready' } });
    if (url.includes('/printer/objects/query')) return Response.json({ result: { status: { print_stats: { state: 'standby' }, virtual_sdcard: { is_active: false } } } });
    if (url.endsWith('/server/files/list?root=config')) return Response.json({ result: [{ path: 'printer.cfg', permissions: 'rw' }] });
    if (url.endsWith('/server/files/config/printer.cfg')) return new Response(contents);
    if (url.endsWith('/server/files/upload')) { writes++; const text = await new Response(options.body).text(); const name = /filename="([^"]+)"/.exec(text)[1]; const folder = /name="path"\r\n\r\n([^\r]+)/.exec(text)?.[1]; const path = folder ? folder + '/' + name : name; if (holdBackup && path.startsWith('.fabcore-backups/')) { enteredBackup(); await backupReleased; } if (path === 'printer.cfg') contents = text.split('Content-Type: application/octet-stream\r\n\r\n')[1].split('\r\n------FabCore')[0]; return Response.json({ item: { path, root: 'config' } }, { status: 201 }); }
    if (url.endsWith('/printer/emergency_stop')) { emergencies++; return Response.json({ result: 'ok' }); }
    if (url.endsWith('/printer/restart')) { restarts++; return Response.json({ result: 'ok' }); }
    throw new Error('unexpected fixture request');
  };
  const { server, token } = createFabCore({ store, directory, origin: 'http://fabcore.test', fetchFiles: native, readPrinter: async () => ({ status: 'ready', file: '', progress: 0, issue: null, nozzle: 20, bed: 20 }) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const call = (path, body, cookie, origin = 'http://fabcore.test') => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method: body === undefined ? 'GET' : 'POST', headers: { Host: 'fabcore.test', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk); const text = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, headers: res.headers, body: res.headers['content-type']?.startsWith('application/json') ? JSON.parse(text) : text });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const path = '/api/machines/' + id + '/klipper-config';
  assert.equal((await call(path)).status, 401);
  const setup = await call('/api/setup', { username: 'admin', password: 'test-config-password', token }); const admin = setup.headers['set-cookie'][0].split(';')[0];
  const fleet = await call('/api/machines', undefined, admin);
  assert.equal(fleet.body.machines.find(item => item.id === id).capabilities.configuration, true, 'capacité configuration transmise au navigateur');
  await call('/api/observers', { username: 'viewer', password: 'config-viewer-password' }, admin);
  const observer = (await call('/api/login', { username: 'viewer', password: 'config-viewer-password' })).headers['set-cookie'][0].split(';')[0];
  assert.equal((await call(path, undefined, observer)).status, 403);
  assert.equal((await call(path + '?path=printer.cfg&download=1', undefined, observer)).status, 403);
  assert.equal((await call(path + '?path=..%2Fprinter.cfg', undefined, admin)).status, 400);
  const opened = await call(path + '?path=printer.cfg', undefined, admin); assert.equal(opened.body.content, contents);
  const download = await call(path + '?path=printer.cfg&download=1', undefined, admin); assert.equal(download.body, contents); assert.match(download.headers['content-disposition'], /attachment/);
  assert.equal((await call(path, { path: 'printer.cfg', content: 'changed', expectedRevision: opened.body.revision, confirm: true }, admin, 'http://foreign.test')).status, 403);
  assert.equal((await call(path, { path: 'printer.cfg', content: 'changed', expectedRevision: opened.body.revision }, admin)).status, 400);
  const saved = await call(path, { path: 'printer.cfg', content: '[printer]\nmax_velocity: 250\n', expectedRevision: opened.body.revision, confirm: true }, admin); assert.equal(saved.status, 200); assert.match(saved.body.backupPath, /\.bak$/); assert.equal(writes, 2); assert.equal(restarts, 0);
  assert.equal((await call(path, { path: 'printer.cfg', content: 'stale', expectedRevision: opened.body.revision, confirm: true }, admin)).status, 409);
  const restart = '/api/machines/' + id + '/klipper-restart'; assert.equal((await call(restart, {}, admin)).status, 400); assert.equal((await call(restart, { confirm: true }, observer)).status, 403);
  assert.equal((await call(restart, { confirm: true }, admin)).body.outcome, 'accepted'); assert.equal(restarts, 1);
  const fresh = await call(path + '?path=printer.cfg', undefined, admin); const before = contents; holdBackup = true;
  const pendingSave = call(path, { path: 'printer.cfg', content: 'must not replace after emergency', expectedRevision: fresh.body.revision, confirm: true }, admin);
  await backupEntered;
  assert.equal((await call('/api/machines/' + id + '/command', { action: 'pause' }, admin)).status, 409, 'configuration owns the ordinary write lock');
  const emergency = await call('/api/machines/' + id + '/command', { action: 'emergencyStop', confirm: true }, admin); assert.equal(emergency.body.outcome, 'accepted'); assert.equal(emergencies, 1);
  releaseBackup(); assert.equal((await pendingSave).status, 409, 'completed emergency invalidates the unsent write too'); assert.equal(contents, before); assert.equal(writes, 3, 'only the backup was uploaded');
});
