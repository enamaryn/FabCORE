// Flux SSE (MIG-05.1) contre le vrai serveur : session requise, événements reçus, maintien, reprise,
// fermeture à la déconnexion et limite de flux par session.
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createFabCore } from './server.mjs';

const origin = 'http://fabcore.test';
async function start(ctx) {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-events-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  let nozzle = 20;
  const { server, token } = createFabCore({ directory, origin, activationToken: 'events-activation', eventHeartbeatMs: 50,
    readPrinter: async () => ({ status: 'ready', nozzle, bed: 20, progress: 0, file: '' }) });
  ctx.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const send = (path, body, cookie) => new Promise((resolve, reject) => {
    const req = request(base + path, { method: 'POST', headers: { Host: 'fabcore.test', Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) } }, async res => {
      let text = ''; for await (const chunk of res) text += chunk;
      resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null, cookie: res.headers['set-cookie']?.[0].split(';')[0] });
    });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
  // Lit le flux et résout dès que `until(texte)` est vrai ; `ended` se résout à la fermeture par le serveur.
  const stream = (cookie, headers = {}) => new Promise((resolve, reject) => {
    const req = request(base + '/api/events', { headers: { Host: 'fabcore.test', ...(cookie ? { Cookie: cookie } : {}), ...headers } }, res => {
      let text = '';
      const waiters = [];
      const ended = new Promise(done => res.on('end', done));
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; for (const waiter of [...waiters]) if (waiter.until(text)) { waiters.splice(waiters.indexOf(waiter), 1); waiter.resolve(text); } });
      res.resume();
      resolve({ status: res.statusCode, headers: res.headers, ended, text: () => text, close: () => req.destroy(),
        wait: until => until(text) ? Promise.resolve(text) : new Promise(done => waiters.push({ until, resolve: done })) });
    });
    req.on('error', error => { if (error.code !== 'ECONNRESET') reject(error); });
    req.end();
  });
  return { send, stream, token, setNozzle: value => { nozzle = value; } };
}

test('SSE : session requise, télémétrie et parc reçus, maintien, reprise et fermeture à la déconnexion', async ctx => {
  const { send, stream, token, setNozzle } = await start(ctx);
  const anonymous = await stream();
  assert.equal(anonymous.status, 401);
  const admin = (await send('/api/setup', { token, username: 'atelier', password: 'long-admin-password' })).cookie;
  const live = await stream(admin);
  assert.equal(live.status, 200);
  assert.match(live.headers['content-type'], /^text\/event-stream/);
  assert.equal(live.headers['x-accel-buffering'], 'no');
  const created = await send('/api/machines', { name: 'Voron', origin: 'http://192.168.1.20:7125' }, admin);
  const machineId = created.body.id;
  await live.wait(text => text.includes('event: fleet.changed') && text.includes(machineId));
  await live.wait(text => /event: machine\.telemetry\ndata: .*"status":"ready"/.test(text));
  setNozzle(42);
  await live.wait(text => text.includes('"nozzle":42'));
  await live.wait(text => text.includes(': ping'));
  // Reprise : identifiant connu → suite seulement ; identifiant d'un autre démarrage → resync.
  const firstId = /^id: (.+)$/m.exec(live.text())[1];
  const resumed = await stream(admin, { 'Last-Event-ID': firstId });
  await resumed.wait(text => text.includes('"nozzle":42'));
  assert.ok(!resumed.text().includes(`id: ${firstId}\n`), 'événement déjà reçu non rejoué');
  const stale = await stream(admin, { 'Last-Event-ID': 'ancien:12' });
  await stale.wait(text => text.includes('event: resync'));
  // Un observateur reçoit les événements du parc ; la déconnexion ferme ses flux.
  await send('/api/observers', { username: 'lecteur', password: 'long-viewer-password' }, admin);
  const viewer = (await send('/api/login', { username: 'lecteur', password: 'long-viewer-password' })).cookie;
  const watching = await stream(viewer);
  await send('/api/machines/' + machineId + '/spool', { spool: { material: 'PLA' } }, admin);
  await watching.wait(text => text.includes('event: fleet.changed'));
  await send('/api/logout', {}, viewer);
  await watching.ended;
  for (const open of [live, resumed, stale]) open.close();
});

test('SSE : quatre flux au plus par session, les plus anciens fermés', async ctx => {
  const { send, stream, token } = await start(ctx);
  const admin = (await send('/api/setup', { token, username: 'atelier', password: 'long-admin-password' })).cookie;
  const streams = [];
  for (let index = 0; index < 5; index++) streams.push(await stream(admin));
  await streams[0].ended;
  await streams[4].wait(text => text.includes('retry: 3000'));
  for (const open of streams) open.close();
});
