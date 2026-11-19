import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFabCore } from './server.mjs';
import { filePath } from './connector-http.mjs';
import { createOctoPrintFiles } from './octoprint.mjs';

const gcode = 'M83\nG1 Z0.2\nG1 X10 Y0 E1\n';

test('les chemins de fichiers restent relatifs, imprimables et en .gcode', () => {
  for (const path of ['cube.gcode', 'dossier/Benchy 0.2mm.gco', 'a/b/c.G']) assert.equal(filePath(path), path);
  for (const path of ['', '../secret.gcode', 'a/../b.gcode', '..\\evil.gcode', '/abs.gcode', 'a//b.gcode', 'image.png', 'é.gcode', 'x'.repeat(250) + '.gcode', ' cube.gcode', 42]) {
    assert.equal(filePath(path), null, String(path));
  }
});

test('OctoPrint : liste à plat des fichiers machine et sélection avec lancement', async () => {
  const requests = [];
  const files = createOctoPrintFiles(async (url, options) => {
    requests.push([url, options.method, options.headers['X-Api-Key'], options.body]);
    if (url.endsWith('/api/files/local?recursive=true')) {
      return Response.json({ files: [
        { type: 'folder', children: [{ type: 'machinecode', path: 'pieces/cube.gcode', size: 12, date: 1700000000 }] },
        { type: 'model', path: 'cube.stl' }, { type: 'machinecode', path: '../evil.gcode' }
      ] });
    }
    return new Response(null, { status: 204 });
  });
  const machine = { origin: 'http://192.168.1.42:5000', apiKey: 'octo-key' };
  assert.deepEqual(await files.list(machine), [{ path: 'pieces/cube.gcode', size: 12, modified: 1700000000000 }]);
  assert.equal(await files.start(machine, 'pieces/cube.gcode'), true);
  assert.deepEqual(requests.at(-1), ['http://192.168.1.42:5000/api/files/local/pieces/cube.gcode', 'POST', 'octo-key', JSON.stringify({ command: 'select', print: true })]);
});

test('parcours HTTP des fichiers Moonraker : liste, lecture, envoi et lancement confirmé', async (ctx) => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-files-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  let status = 'ready';
  let startFails = false;
  const stored = new Map([['cube.gcode', gcode]]);
  const calls = [];
  const uploadHosts = [];
  const fetchFiles = async (url, options) => {
    const { pathname, searchParams } = new URL(url);
    calls.push(options.method + ' ' + pathname);
    assert.equal(options.redirect, 'error');
    if (pathname === '/server/files/list') return Response.json({ result: [...stored].map(([path, text]) => ({ path, size: text.length, modified: 1700000000 })) });
    if (pathname.startsWith('/server/files/gcodes/')) {
      const text = stored.get(decodeURIComponent(pathname.slice('/server/files/gcodes/'.length)));
      return text ? new Response(text, { headers: { 'Content-Length': String(text.length) } }) : new Response('', { status: 404 });
    }
    if (pathname === '/server/files/upload') {
      uploadHosts.push(new URL(url).hostname);
      const form = await new Response(options.body, { headers: { 'Content-Type': options.headers['Content-Type'] } }).formData();
      assert.equal(Number(options.headers['Content-Length']) > 0, true);
      assert.equal(form.get('root'), 'gcodes');
      const file = form.get('file');
      stored.set(file.name, await file.text());
      return Response.json({ item: { path: file.name, root: 'gcodes' }, action: 'create_file' }, { status: 201 });
    }
    if (pathname === '/printer/print/start') {
      if (startFails) throw new TypeError('connection lost');
      assert.equal(searchParams.get('filename'), 'nouveau.gcode');
      status = 'printing';
      return Response.json({ result: 'ok' });
    }
    return new Response('', { status: 404 });
  };
  const origin = 'http://fabcore.test';
  const { server, token } = createFabCore({
    directory, origin, activationToken: 'test-activation-token', fetchFiles,
    readPrinter: async () => ({ status, issue: null, nozzle: 20, bed: 20, progress: 0, file: '' }),
    readPrusa: async () => ({ status: 'ready', issue: null, nozzle: 20, bed: 20, progress: 0, file: '' })
  });
  ctx.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (url, { body, cookie, type = 'application/json', requestOrigin = origin } = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const req = request(base + url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Host: 'fabcore.test', Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': type }) }
    }, async (response) => {
      const chunks = [];
      for await (const chunk of response) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString();
      resolve({ status: response.statusCode, headers: response.headers, text, json: response.headers['content-type']?.includes('json') ? JSON.parse(text) : null });
    });
    req.on('error', reject);
    req.end(payload);
  });
  const activation = await call('/api/setup', { body: { username: 'atelier', password: 'demo-password-long', token } });
  const cookie = activation.headers['set-cookie'][0].split(';')[0];
  const { id } = (await call('/api/machines', { body: { name: 'Voron', origin: 'http://192.168.1.40:7125' }, cookie })).json;
  const prusa = (await call('/api/machines', { body: { kind: 'prusalink', name: 'MK4', origin: 'http://192.168.1.69', apiKey: 'prusa-key' }, cookie })).json.id;
  await call('/api/observers', { body: { username: 'observateur', password: 'observer-demo-password' }, cookie });
  const watcher = (await call('/api/login', { body: { username: 'observateur', password: 'observer-demo-password' } })).headers['set-cookie'][0].split(';')[0];
  const destination = (await call('/api/machines', { body: { name: 'Voron 2', origin: 'http://192.168.1.41:7125' }, cookie })).json.id;
  const root = '/api/machines/' + id;

  assert.equal((await call(root + '/files')).status, 401);
  assert.equal((await call('/api/machines/' + prusa + '/files', { cookie })).status, 502);
  assert.deepEqual((await call(root + '/files', { cookie: watcher })).json, { files: [{ path: 'cube.gcode', size: gcode.length, modified: 1700000000000 }] });
  const read = await call(root + '/file?path=cube.gcode', { cookie: watcher });
  assert.deepEqual([read.status, read.text], [200, gcode]);
  assert.equal((await call(root + '/file?path=..%2Fetc%2Fpasswd', { cookie })).status, 400);
  assert.equal((await call(root + '/file?path=absent.gcode', { cookie })).status, 404);

  const attachment = await call(root + '/file?download=1&path=cube.gcode', { cookie: watcher });
  assert.equal(attachment.status, 200);
  assert.equal(attachment.text, gcode);
  assert.equal(attachment.headers['content-type'], 'application/octet-stream');
  assert.match(attachment.headers['content-disposition'], /attachment; filename\*=UTF-8''cube.gcode/);
  assert.equal(attachment.headers['cache-control'], 'no-store');
  assert.equal((await call(root + '/file?download=1&path=cube.gcode')).status, 401);
  const transfer = (body, options = {}) => call(root + '/transfer', { body: { path: 'cube.gcode', destination, name: 'copie.gcode', confirm: true, ...body }, cookie, ...options });
  const beforeTransfer = calls.length;
  assert.equal((await transfer({}, { cookie: watcher })).status, 403);
  assert.equal((await transfer({}, { cookie: undefined })).status, 401);
  assert.equal((await transfer({}, { requestOrigin: 'http://evil.test' })).status, 403);
  assert.equal((await transfer({ confirm: false })).status, 400);
  assert.equal((await transfer({ destination: id })).status, 400);
  assert.equal((await transfer({ path: '../cube.gcode' })).status, 400);
  assert.equal((await transfer({ name: 'copy.3mf' })).status, 400);
  assert.equal((await transfer({ name: '../copy.gcode' })).status, 400);
  assert.equal(calls.length, beforeTransfer, 'aucun échange machine après une demande non autorisée');
  const copied = await transfer({});
  assert.deepEqual([copied.status, copied.json], [201, { path: 'copie.gcode', destination }]);
  assert.equal(stored.get('copie.gcode'), gcode);
  assert.equal(uploadHosts.at(-1), '192.168.1.41');
  assert.equal(calls.some(call => call.endsWith('/printer/print/start')), false, 'la copie ne lance jamais');
  assert.equal((await transfer({})).status, 409, 'pas d’écrasement implicite');
  assert.equal((await transfer({ path: 'absent.gcode', name: 'missing.gcode' })).status, 404);

  const upload = (name, options) => call(root + '/files?name=' + encodeURIComponent(name), { body: gcode, type: 'application/octet-stream', ...options });
  assert.equal((await upload('nouveau.gcode', { cookie: watcher })).status, 403);
  assert.equal((await upload('nouveau.gcode', { cookie, requestOrigin: 'http://other.test' })).status, 403);
  assert.equal((await upload('../nouveau.gcode', { cookie })).status, 400);
  assert.equal((await upload('photo.png', { cookie })).status, 400);
  const sent = await upload('nouveau.gcode', { cookie });
  assert.deepEqual([sent.status, sent.json], [201, { path: 'nouveau.gcode' }]);
  assert.equal(stored.get('nouveau.gcode'), gcode);

  const print = (body, options = {}) => call(root + '/print', { body, cookie, ...options });
  assert.equal((await print({ path: 'nouveau.gcode', confirm: true }, { cookie: watcher })).status, 403);
  assert.equal((await print({ path: 'nouveau.gcode' })).status, 400, 'la confirmation est obligatoire');
  status = 'printing';
  assert.deepEqual((await print({ path: 'nouveau.gcode', confirm: true })).json, { error: 'command-state' });
  status = 'ready';
  assert.deepEqual((await print({ path: 'nouveau.gcode', confirm: true })).json, { status: 'printing' });
  status = 'done';
  startFails = true;
  const before = calls.filter(entry => entry.endsWith('/printer/print/start')).length;
  const unknown = await print({ path: 'nouveau.gcode', confirm: true });
  assert.deepEqual([unknown.status, unknown.json], [504, { error: 'command-unconfirmed' }]);
  assert.equal(calls.filter(entry => entry.endsWith('/printer/print/start')).length, before + 1, 'aucun renvoi automatique');
});
