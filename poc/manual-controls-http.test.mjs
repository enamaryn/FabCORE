import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createFabCore } from './server.mjs';

test('HTTP contrôles : droits, origine, état, limites, confirmation, débit et résultat inconnu sans rejeu', async ctx => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-controls-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  let status = 'ready', fail = false;
  const sent = [];
  const origin = 'http://fabcore.test';
  const { server, token } = createFabCore({ directory, origin, activationToken: 'controls-activation-token',
    readPrinter: async () => ({ status, nozzle: 20, bed: 20, progress: 0, file: '', issue: null }),
    fetchFiles: async (url, options) => {
      if (url.endsWith('/list')) return Response.json({ result: { objects: ['extruder', 'fan', 'toolhead', 'gcode_move'] } });
      if (url.endsWith('/query')) return Response.json({ result: { status: { extruder: { temperature: 20, target: 0 }, fan: { speed: 0.1 }, toolhead: { homed_axes: 'xyz', position: [0,0,0], axis_minimum: [0,0,0], axis_maximum: [200,200,200] }, gcode_move: { gcode_position: [0,0,0] } } } });
      sent.push(JSON.parse(options.body).script);
      if (fail) throw new Error('connection lost after sending');
      return Response.json({ result: 'ok' });
    } });
  ctx.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = (path, body, cookie, site = origin) => new Promise((resolve, reject) => {
    const req = request(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Host: 'fabcore.test', Origin: site, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk);
      resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const activation = await call('/api/setup', { username: 'atelier', password: 'controls-test-password', token });
  const cookie = activation.headers['set-cookie'][0].split(';')[0];
  const id = (await call('/api/machines', { name: 'Klipper', origin: 'http://192.168.1.40:7125' }, cookie)).body.id;
  await call('/api/observers', { username: 'observateur', password: 'observer-test-password' }, cookie);
  const viewer = (await call('/api/login', { username: 'observateur', password: 'observer-test-password' })).headers['set-cookie'][0].split(';')[0];
  const fleet = (await call('/api/machines', undefined, viewer)).body.machines;
  assert.equal(fleet[0].capabilities.controls, true);
  assert.equal(fleet[0].capabilities.camera, true);
  assert.deepEqual(fleet[0].capabilities.commandActions, ['pause', 'resume', 'stop', 'emergencyStop']);
  assert.doesNotMatch(JSON.stringify(fleet[0].capabilities), /password|apiKey|accessCode/);
  const path = '/api/machines/' + id + '/controls';
  const heat = { action: 'heat', id: 'nozzle', value: 200, confirm: true };
  assert.equal((await call(path)).status, 401);
  assert.equal((await call(path, undefined, viewer)).status, 200);
  assert.equal((await call(path, heat, viewer)).status, 403);
  assert.equal((await call(path, heat, cookie, 'http://evil.test')).status, 403);
  assert.equal(sent.length, 0);
  assert.equal((await call(path, heat, cookie)).body.outcome, 'executed');
  assert.equal((await call(path, heat, cookie)).status, 429);
  await delay(510);
  assert.equal((await call(path, { ...heat, value: 9999 }, cookie)).status, 400);
  await delay(510); status = 'printing';
  assert.equal((await call(path, { action: 'home', confirm: true }, cookie)).status, 409);
  await delay(510);
  assert.equal((await call(path, heat, cookie)).body.error, 'control-confirm');
  await delay(510);
  assert.equal((await call(path, { ...heat, duringPrint: true }, cookie)).status, 200);
  await delay(510); status = 'offline';
  assert.equal((await call(path, heat, cookie)).status, 409);
  await delay(510); status = 'ready'; fail = true;
  const before = sent.length;
  assert.equal((await call(path, heat, cookie)).status, 504);
  assert.equal(sent.length, before + 1);
});
