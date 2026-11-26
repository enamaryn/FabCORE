// Parité des écritures machines, bobine et découverte : ordre des refus, codes et corps, contre le vrai serveur.
import assert from 'node:assert/strict';
import { globalAgent, request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFabCore } from './server.mjs';

const origin = 'http://fabcore.test';
const ready = { status: 'ready', issue: null, progress: 0, nozzle: 20, bed: 20, file: '' };
async function start(ctx, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-machine-writes-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  const reads = [];
  const { server, token } = createFabCore({
    directory, origin, activationToken: 'machine-writes-activation',
    readPrinter: async machine => { reads.push(machine.origin); return machine.origin.endsWith(':7199') ? { ...ready, status: 'error', issue: 'klippy' } : ready; },
    networks: () => [{ cidr: '192.168.1.0/24' }],
    scan: async () => [],
    ...options,
  });
  ctx.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const send = (path, { raw, body, cookie, requestOrigin = origin, method = body === undefined && raw === undefined ? 'GET' : 'POST' } = {}) => new Promise((resolve, reject) => {
    const payload = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    const req = request(base + path, { method, headers: { Host: 'fabcore.test', Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk);
      const text = Buffer.concat(chunks).toString();
      resolve([res.statusCode, text ? JSON.parse(text) : null]);
    });
    req.on('error', reject); req.end(payload);
  });
  const cookieOf = async body => new Promise((resolve, reject) => {
    const req = request(base + (body.token ? '/api/setup' : '/api/login'), { method: 'POST', headers: { Host: 'fabcore.test', Origin: origin, 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.headers['set-cookie'][0].split(';')[0]); });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
  const admin = await cookieOf({ username: 'atelier', password: 'long-enough-password', token });
  await send('/api/observers', { body: { username: 'lecture', password: 'observer-password' }, cookie: admin });
  const observer = await cookieOf({ username: 'lecture', password: 'observer-password' });
  return { send, admin, observer, reads };
}
const klipper = (port, extra = {}) => ({ kind: 'klipper', name: 'Voron ' + port, origin: `http://192.168.1.20:${port}`, ...extra });

test('machines : origine avant droits, droits avant corps, corps et configuration refusés', async ctx => {
  const { send, observer } = await start(ctx);
  assert.deepEqual(await send('/api/machines', { body: klipper(7125), requestOrigin: 'http://evil.test' }), [403, { error: 'origin' }], 'origine contrôlée avant la session');
  assert.deepEqual(await send('/api/machines', { body: klipper(7125) }), [401, { error: 'sign-in' }]);
  assert.deepEqual(await send('/api/machines', { raw: '{', cookie: observer }), [403, { error: 'forbidden' }], 'observateur refusé avant le corps');
  const { admin } = await start(ctx);
  assert.deepEqual(await send('/api/machines/delete', { raw: '[]', cookie: admin }), [401, { error: 'sign-in' }], 'session d’un autre serveur inconnue');
});

test('machines : ajout, doublon, test, édition, appairage refusé, suppression et limite', async ctx => {
  const { send, admin, reads } = await start(ctx);
  assert.deepEqual(await send('/api/machines', { raw: '{', cookie: admin }), [400, { error: 'invalid' }]);
  assert.deepEqual(await send('/api/machines', { body: { kind: 'klipper', origin: 'http://192.168.1.20:7125' }, cookie: admin }), [400, { error: 'machine-invalid' }], 'nom manquant');
  assert.deepEqual(await send('/api/machines', { body: klipper(7125, { origin: 'http://8.8.8.8:7125' }), cookie: admin }), [400, { error: 'machine-invalid' }], 'adresse publique refusée');
  const [created, { id }] = await send('/api/machines', { body: klipper(7125), cookie: admin });
  assert.equal(created, 201);
  assert.match(id, /^[a-f0-9-]{36}$/);
  assert.deepEqual(await send('/api/machines', { body: klipper(7125, { name: 'Copie' }), cookie: admin }), [409, { error: 'machine-duplicate' }]);
  assert.deepEqual(await send('/api/machines/test', { body: klipper(7126), cookie: admin }), [200, { ok: true, issue: null }]);
  assert.deepEqual(await send('/api/machines/test', { body: klipper(7199), cookie: admin }), [200, { ok: false, issue: 'klippy' }]);
  assert.ok(reads.includes('http://192.168.1.20:7126'), 'le test interroge la machine');
  assert.deepEqual(await send('/api/machines/edit', { body: { ...klipper(7127), id: '00000000-0000-0000-0000-000000000000' }, cookie: admin }), [404, { error: 'missing' }]);
  assert.deepEqual(await send('/api/machines', { body: { ...klipper(7127), id: '00000000-0000-0000-0000-000000000000' }, cookie: admin }), [404, { error: 'missing' }], 'identifiant inconnu');
  assert.deepEqual(await send('/api/machines/edit', { body: { ...klipper(7125), id, kind: 'octoprint' }, cookie: admin }), [400, { error: 'machine-invalid' }], 'type non modifiable');
  assert.deepEqual(await send('/api/machines/edit', { body: { ...klipper(7128, { name: 'Voron renommée' }), id }, cookie: admin }), [200, { id }]);
  assert.deepEqual(await send('/api/machines/pair', { body: klipper(7129), cookie: admin }), [400, { error: 'machine-invalid' }], 'appairage réservé à la M2');
  for (let port = 7130; port < 7137; port++) assert.equal((await send('/api/machines', { body: klipper(port), cookie: admin }))[0], 201);
  assert.deepEqual(await send('/api/machines', { body: klipper(7140), cookie: admin }), [409, { error: 'machine-limit' }]);
  assert.deepEqual(await send('/api/machines/delete', { body: { id }, cookie: admin }), [200, { id }]);
  assert.deepEqual(await send('/api/machines/delete', { body: { id }, cookie: admin }), [404, { error: 'missing' }]);
  assert.deepEqual(await send('/api/machines/delete', { method: 'GET', cookie: admin }), [404, { error: 'missing' }], 'GET reste refusé');
});

test('bobine manuelle : droits avant origine, machine, type et contenu', async ctx => {
  const { send, admin, observer } = await start(ctx);
  const [, { id }] = await send('/api/machines', { body: klipper(7125), cookie: admin });
  const path = `/api/machines/${id}/spool`;
  assert.deepEqual(await send(path, { body: {}, requestOrigin: 'http://evil.test' }), [401, { error: 'sign-in' }], 'sans session : 401 avant l’origine');
  assert.deepEqual(await send(path, { body: {}, cookie: observer }), [403, { error: 'forbidden' }]);
  assert.deepEqual(await send(path, { body: {}, cookie: admin, requestOrigin: 'http://evil.test' }), [403, { error: 'origin' }]);
  assert.deepEqual(await send('/api/machines/00000000-0000-0000-0000-000000000000/spool', { body: { spool: null }, cookie: admin }), [404, { error: 'missing' }]);
  assert.deepEqual(await send(path, { body: { spool: { material: '' } }, cookie: admin }), [400, { error: 'spool-invalid' }]);
  assert.deepEqual(await send(path, { body: { spool: { material: 'PETG', name: 'Noir', color: '#11aa22' } }, cookie: admin }), [200, { manualSpool: { material: 'PETG', name: 'Noir', color: '#11AA22' } }]);
  assert.deepEqual(await send(path, { body: { spool: null }, cookie: admin }), [200, { manualSpool: null }]);
  assert.deepEqual(await send('/api/machines/pas-un-uuid/spool', { body: { spool: null }, cookie: admin }), [404, { error: 'missing' }]);
});

test('découverte : réseaux, droits, réseau inconnu et résultat réconcilié', async ctx => {
  const { send, admin, observer } = await start(ctx);
  assert.deepEqual(await send('/api/discovery'), [401, { error: 'sign-in' }]);
  assert.deepEqual(await send('/api/discovery', { cookie: observer }), [403, { error: 'forbidden' }]);
  assert.deepEqual(await send('/api/discovery', { cookie: admin }), [200, { networks: ['192.168.1.0/24'] }]);
  assert.deepEqual(await send('/api/discovery', { body: { network: '10.0.0.0/8' }, cookie: admin, requestOrigin: 'http://evil.test' }), [403, { error: 'origin' }]);
  assert.deepEqual(await send('/api/discovery', { raw: '{', cookie: admin }), [400, { error: 'invalid' }]);
  assert.deepEqual(await send('/api/discovery', { body: { network: '10.0.0.0/8' }, cookie: admin }), [400, { error: 'discovery-network' }]);
  assert.deepEqual(await send('/api/discovery', { body: { network: '192.168.1.0/24' }, cookie: admin }), [200, { devices: [] }]);
  assert.deepEqual(await send('/api/discovery', { method: 'PUT', body: {}, cookie: admin }), [405, { error: 'missing' }]);
});

test('découverte : un client qui ferme la requête annule le scan et libère la découverte', async ctx => {
  let aborted = false;
  let started;
  const scanning = new Promise(resolve => { started = resolve; });
  const { send, admin } = await start(ctx, {
    scan: (_network, signal) => new Promise(resolve => {
      started();
      signal.addEventListener('abort', () => { aborted = true; resolve([]); }, { once: true });
    }),
  });
  const pending = send('/api/discovery', { body: { network: '192.168.1.0/24' }, cookie: admin }).catch(() => 'closed');
  await scanning;
  globalAgent.destroy(); // le client abandonne : sockets fermées
  await pending;
  for (let attempt = 0; attempt < 50 && !aborted; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(aborted, true, 'scan annulé à la fermeture de la requête');
  const [status] = await send('/api/discovery', { body: { network: '10.0.0.0/8' }, cookie: admin });
  assert.equal(status, 400, 'découverte libérée : nouvelle requête traitée');
});

test('urgence : droits, cible, confirmation et résultat natif ; une seule écriture sans rejeu', async ctx => {
  let writes = 0, mode = 'accepted', shutdown = false;
  const { send, admin, observer } = await start(ctx, {
    readPrinter: async () => shutdown ? { ...ready, status: 'error', issue: 'moonraker-shutdown' } : ready,
    fetchFiles: async (url, options) => {
      assert.ok(url.endsWith('/printer/emergency_stop'));
      assert.equal(options.method, 'POST'); writes++;
      if (mode === 'network') throw new Error('connection lost');
      if (mode === 'refused') return new Response('', { status: 403 });
      if (mode === 'confirmed') shutdown = true;
      return Response.json({ result: 'ok' });
    },
  });
  const [, { id }] = await send('/api/machines', { body: klipper(7125), cookie: admin });
  const path = '/api/machines/' + id + '/command';
  const command = { action: 'emergencyStop', confirm: true };
  assert.deepEqual(await send(path, { body: command, cookie: observer }), [403, { error: 'forbidden' }]);
  assert.deepEqual(await send(path, { body: command }), [401, { error: 'sign-in' }]);
  assert.deepEqual(await send(path, { body: command, cookie: admin, requestOrigin: 'http://evil.test' }), [403, { error: 'origin' }]);
  assert.deepEqual(await send(path, { body: { ...command, confirm: false }, cookie: admin }), [400, { error: 'invalid' }]);
  assert.equal(writes, 0);
  assert.deepEqual(await send(path, { body: command, cookie: admin }), [200, { outcome: 'accepted', nativeCode: 200 }]);
  assert.equal(writes, 1);
  mode = 'refused';
  assert.deepEqual(await send(path, { body: command, cookie: admin }), [200, { outcome: 'rejected', nativeCode: 403 }]);
  mode = 'network';
  assert.deepEqual(await send(path, { body: command, cookie: admin }), [200, { outcome: 'unknown' }]);
  await send('/api/machines', { cookie: admin });
  assert.equal(writes, 3, 'a read/reconnect never resends an emergency');
  mode = 'confirmed';
  assert.deepEqual(await send(path, { body: command, cookie: admin }), [200, { outcome: 'confirmed', nativeCode: 200, status: 'error', issue: 'moonraker-shutdown' }]);
  // A shutdown/error state must not hide the emergency endpoint behind a printing-only gate.
  mode = 'refused';
  assert.equal((await send(path, { body: command, cookie: admin }))[0], 200);
  assert.equal(writes, 5);
  const [, logs] = await send('/api/machines/' + id + '/logs', { cookie: admin });
  assert.ok(logs.lines.some(line => line.event === 'operation-result' && line.details.operation === 'emergencyStop' && line.details.nativeCode === 403 && line.details.outcome === 'rejected'), 'native refusal remains reviewable in machine logs');
});
