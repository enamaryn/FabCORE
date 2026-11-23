// MIG-03.2.2/3 : corrélation des journaux, niveaux, refus réseau et résultat inconnu sans rejeu.
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFabCore } from './server.mjs';

const origin = 'http://fabcore.test';
async function start(ctx, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-correlation-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  const sent = [];
  const { server, token } = createFabCore({ directory, origin, activationToken: 'correlation-activation',
    readPrinter: async () => ({ status: 'printing', issue: null, progress: 40, nozzle: 210, bed: 60, file: 'cube.gcode' }),
    sendCommand: async (machine, action) => { sent.push(action); const failure = new Error('connect ECONNREFUSED'); failure.code = 'ECONNREFUSED'; throw failure; },
    ...options });
  ctx.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const send = (path, { method = 'GET', body, cookie, headers = {} } = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request(base + path, { method, headers: { Host: 'fabcore.test', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}), ...headers } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString();
      resolve({ status: res.statusCode, headers: res.headers, json: text ? JSON.parse(text) : null });
    });
    req.on('error', reject); req.end(payload);
  });
  const setup = await send('/api/setup', { method: 'POST', body: { username: 'atelier', password: 'long-enough-password', token } });
  const cookie = setup.headers['set-cookie'][0].split(';')[0];
  const id = (await send('/api/machines', { method: 'POST', body: { kind: 'klipper', name: 'Voron', origin: 'http://192.168.1.20:7125', apiKey: 'secret-moonraker-key' }, cookie })).json.id;
  return { send, cookie, id, sent };
}

test('corrélation : identifiant renvoyé, repris dans le journal de la requête, refus réseau inconnu sans rejeu', async ctx => {
  const { send, cookie, id, sent } = await start(ctx);
  const generated = await send('/api/session');
  assert.match(generated.headers['x-request-id'], /^[0-9a-f-]{36}$/);
  assert.match((await send('/api/session', { headers: { 'X-Request-Id': 'bad id' } })).headers['x-request-id'], /^[0-9a-f-]{36}$/, 'valeur invalide remplacée');
  const command = await send(`/api/machines/${id}/command`, { method: 'POST', body: { action: 'pause' }, cookie, headers: { 'X-Request-Id': 'atelier-req-0042' } });
  assert.equal(command.headers['x-request-id'], 'atelier-req-0042');
  assert.deepEqual([command.status, command.json], [504, { error: 'command-unconfirmed' }], 'refus réseau : résultat inconnu, jamais un succès');
  assert.deepEqual(sent, ['pause'], 'aucun rejeu');
  const { lines } = (await send(`/api/machines/${id}/logs`, { cookie })).json;
  const correlated = lines.filter(line => line.requestId === 'atelier-req-0042');
  assert.ok(correlated.length >= 2, 'début et erreur de l’opération rattachés à la requête');
  assert.ok(correlated.every(line => ['debug', 'info', 'warn', 'error'].includes(line.level)));
  assert.ok(correlated.some(line => line.event === 'operation-error' && line.level === 'debug' && line.details.code === 'operation-failed'));
  assert.ok(!JSON.stringify(lines).includes('secret-moonraker-key'), 'clé API jamais journalisée');
  const diagnostics = (await send('/api/diagnostics', { cookie })).json;
  assert.ok(diagnostics.events.every(event => typeof event.level === 'string'));
});

test('niveaux : FABCORE_LOG_LEVEL=info écarte les échanges protocolaires', async ctx => {
  const { send, cookie, id } = await start(ctx, { logLevel: 'info' });
  await send(`/api/machines/${id}/command`, { method: 'POST', body: { action: 'pause' }, cookie });
  const { lines } = (await send(`/api/machines/${id}/logs`, { cookie })).json;
  assert.equal(lines.some(line => line.area === 'protocol' || line.level === 'debug'), false);
});
