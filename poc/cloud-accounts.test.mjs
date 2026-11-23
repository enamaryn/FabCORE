import { EventEmitter } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createCloudAccounts } from './cloud-accounts.mjs';
import { openStore } from './store.mjs';
import { createFabCore } from './server.mjs';

const metadata = { provider: 'bambu', name: 'Atelier', email: 'test@example.com', region: 'global' };
const token = 'SYNTHETIC.private.token';
const responseDevices = { devices: [{ dev_id: 'P2STEST123', name: 'P2S', dev_product_name: 'P2S', online: true,
  print_status: 'IDLE', dev_access_code: 'NEVER_EXPOSE_LAN_CODE' }] };
async function setup(ctx, fetcher) {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-cloud-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  const store = openStore(directory);
  const manager = createCloudAccounts({ directory, store, fetcher });
  ctx.after(() => manager.close());
  return { directory, store, manager };
}

test('cloud : plusieurs fabricants et comptes, secrets chiffrés et inventaires indépendants après redémarrage', async ctx => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push([url, options]); assert.equal(options.redirect, 'error');
    if (url.endsWith('/login')) return Response.json({ accessToken: token });
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    return Response.json(responseDevices);
  };
  const { directory, store, manager } = await setup(ctx, fetcher);
  const first = await manager.add(metadata);
  const second = await manager.add({ ...metadata, name: 'Second compte', region: 'china' });
  const planned = await manager.add({ ...metadata, provider: 'creality' });
  await assert.rejects(manager.login(planned.id, { password: 'SYNTHETIC_PASSWORD' }, 'owner'), /cloud-unsupported/);
  const one = await manager.login(first.id, { password: 'SYNTHETIC_PASSWORD' }, 'owner');
  assert.equal(one.status, 'connected'); assert.equal(one.devices[0].serial, 'P2STEST123');
  assert.equal(manager.list().accounts[1].status, 'disconnected');
  assert.doesNotMatch(JSON.stringify(one), /secret|accessToken|NEVER_EXPOSE/);
  const state = await readFile(join(directory, 'state.json'), 'utf8');
  assert.doesNotMatch(state, /SYNTHETIC|NEVER_EXPOSE|password/);
  assert.equal((await stat(join(directory, 'cloud-secret.key'))).mode & 0o777, 0o600);
  const logs = manager.logs(first.id); assert.match(logs, /http-result/); assert.match(logs, /devices-read/); assert.match(logs, /P2STEST123/); assert.match(logs, /dev_product_name/);
  assert.doesNotMatch(logs, /SYNTHETIC|NEVER_EXPOSE|Authorization/);
  const restarted = createCloudAccounts({ directory, store: openStore(directory), fetcher }); ctx.after(() => restarted.close());
  assert.equal((await restarted.refresh(first.id)).devices.length, 1);
  await restarted.login(second.id, { password: 'OTHER_PASSWORD' }, 'other');
  assert.ok(calls.some(([url]) => url.startsWith('https://api.bambulab.cn/')));
  await restarted.disconnect(first.id);
  assert.equal(restarted.list().accounts[1].status, 'connected');
  await restarted.disconnect(second.id, true);
  assert.equal(restarted.list().accounts.length, 2);
  assert.equal((await readdir(join(directory, 'cloud-logs'))).some(name => name.startsWith(second.id)), false);
  assert.equal(store.state.machines.length, 0);
});

test('cloud : challenge email lié à la session, aucun mot de passe conservé, expiration et tentative concurrente bornées', async ctx => {
  const calls = [];
  const { manager, directory } = await setup(ctx, async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null; calls.push([url, body]);
    assert.equal(url.endsWith('/sendemail/code'), false, 'aucune seconde demande de code');
    if (body?.password) return Response.json({ loginType: 'verifyCode', accessToken: '' });
    if (body?.code) return Response.json({ accessToken: token });
    return Response.json(responseDevices);
  });
  const account = await manager.add(metadata);
  assert.equal((await manager.login(account.id, { password: 'SECRET-PASS' }, 'owner')).challenge, 'email');
  assert.equal(calls.length, 1);
  await assert.rejects(manager.verify(account.id, { code: '123456' }, 'different-owner'), /forbidden/);
  assert.equal(calls.length, 1);
  assert.equal((await manager.verify(account.id, { code: '123456' }, 'owner')).status, 'connected');
  assert.equal(calls[1][1].password, undefined);
  assert.doesNotMatch(await readFile(join(directory, 'state.json'), 'utf8'), /SECRET-PASS|123456/);
  assert.doesNotMatch(manager.logs(account.id), /SECRET-PASS|123456/);
  // Expiration without waiting: inject a controllable clock on a fresh manager.
  let clock = 1000;
  const expiring = createCloudAccounts({ directory, store: openStore(directory), now: () => clock,
    fetcher: async () => Response.json({ loginType: 'tfa', tfaKey: 'SYNTHETIC_MFA_KEY' }) });
  ctx.after(() => expiring.close());
  const fresh = await expiring.add({ ...metadata, name: 'Expiry' });
  await expiring.login(fresh.id, { password: 'secret' }, 'owner'); clock += 600001;
  await assert.rejects(expiring.verify(fresh.id, { code: '123456' }, 'owner'), /cloud-code-expired/);
  assert.equal(expiring.list().accounts.find(a => a.id === fresh.id).challenge, null);
});

test('cloud : TOTP utilise le CSRF du portail et efface les cookies des réponses et journaux', async ctx => {
  const calls = [];
  const { manager } = await setup(ctx, async (url, options) => {
    calls.push([url, options]);
    if (url.endsWith('/user/login')) return Response.json({ loginType: 'tfa', tfaKey: 'SECRET_TFA_KEY' });
    if (url.endsWith('/api/csrf')) return new Response(null, { status: 204, headers: { 'Set-Cookie': 'bbl_csrf_token=SECRET_CSRF; Path=/; Secure' } });
    if (url.endsWith('/sign-in/tfa')) {
      assert.equal(options.headers.Cookie, 'bbl_csrf_token=SECRET_CSRF');
      assert.equal(JSON.parse(options.body).tfaKey, 'SECRET_TFA_KEY');
      return Response.json({}, { headers: { 'Set-Cookie': `token=${token}; Path=/; Secure` } });
    }
    return Response.json(responseDevices);
  });
  const account = await manager.add(metadata);
  await manager.login(account.id, { password: 'secret' }, 'owner');
  assert.equal((await manager.verify(account.id, { code: '123456' }, 'owner')).status, 'connected');
  assert.equal(calls[1][0], 'https://bambulab.com/api/csrf');
  assert.doesNotMatch(manager.logs(account.id), /SECRET_|SYNTHETIC|123456/);
});

test('cloud : refus, HTML de challenge, corps trop gros et réponses étrangères ne fuitent pas', async ctx => {
  let response = () => new Response('SECRET_HTML', { status: 403 });
  const { manager } = await setup(ctx, async () => response());
  for (const [expected, make] of [
    ['cloud-access', () => new Response('SECRET_HTML', { status: 403 })],
    ['cloud-rate', () => Response.json({ secret: 'SECRET_BODY' }, { status: 429 })],
    ['cloud-response', () => new Response('SECRET_HTML', { status: 200 })],
    ['cloud-response', () => new Response('X'.repeat(1024 * 1024 + 1))]
  ]) {
    response = make; const account = await manager.add(metadata);
    await assert.rejects(manager.login(account.id, { password: 'SECRET_PASSWORD' }, 'owner'), new RegExp(expected));
    assert.doesNotMatch(manager.logs(account.id), /SECRET_/);
  }
  const account = await manager.add(metadata);
  await assert.rejects(manager.login(account.id, { password: 'x' }, 'owner'), /cloud-response/);
  // The manager has no generic URL input or command endpoint.
  assert.equal(manager.command, undefined);
  await assert.rejects(manager.add({ ...metadata, provider: 'https://example.com' }), /cloud-invalid/);
});

test('cloud : absence de rejeu, verrou par compte, révocation et fichiers log bornés', async ctx => {
  let finish; let calls = 0;
  const { manager, directory } = await setup(ctx, async () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const account = await manager.add(metadata);
  const attempt = manager.login(account.id, { password: 'secret' }, 'owner');
  await assert.rejects(manager.login(account.id, { password: 'secret' }, 'owner'), /cloud-busy/);
  await assert.rejects(manager.disconnect(account.id), /cloud-busy/);
  finish(Response.json({ loginType: 'tfa', tfaKey: 'secret' })); await attempt;
  assert.equal(calls, 1);
  manager.forgetOwner('owner');
  await assert.rejects(manager.verify(account.id, { code: '123456' }, 'owner'), /cloud-code-expired/);
  await writeFile(join(directory, 'cloud-logs', account.id + '.log'), 'X'.repeat(256 * 1024));
  await manager.disconnect(account.id);
  assert.equal((await stat(join(directory, 'cloud-logs', account.id + '.log.1'))).size, 256 * 1024);
  assert.ok((await stat(join(directory, 'cloud-logs', account.id + '.log'))).size < 1000);
  await manager.disconnect(account.id, true);
  assert.throws(() => manager.logs(account.id), /missing/);
});

async function appSetup(ctx) {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-cloud-http-')); ctx.after(() => rm(directory, { recursive: true, force: true }));
  let cloudCalls = 0;
  const { server } = createFabCore({ directory, origin: 'https://fabcore.test', activationToken: 'activate-cloud',
    cloudMqtt: () => { const client = new EventEmitter(); client.options = {}; client.end = () => {}; return client; },
    cloudFetch: async url => { cloudCalls++; return Response.json(url.endsWith('/login') ? { accessToken: token } : url.endsWith('/preference') ? { uid: 123 } : responseDevices); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  ctx.after(() => new Promise(resolve => server.close(resolve)));
  const call = (path, { body, cookie, origin = 'https://fabcore.test' } = {}) => new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: server.address().port, path, method: body === undefined ? 'GET' : 'POST',
      headers: { Host: 'fabcore.test', Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, async res => {
      let text = ''; for await (const chunk of res) text += chunk;
      let data; try { data = JSON.parse(text); } catch { data = text; }
      resolve({ status: res.statusCode, data, headers: res.headers, text });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const session = await call('/api/setup', { body: { token: 'activate-cloud', username: 'admin', password: 'strong-password-for-cloud' } });
  return { directory, call, cookie: session.headers['set-cookie'][0].split(';')[0], count: () => cloudCalls };
}

test('cloud HTTP : droits, origine, inventaire et téléchargement du journal protégés sans secrets', async ctx => {
  const { call, cookie, count } = await appSetup(ctx);
  assert.equal((await call('/api/cloud-accounts')).status, 401);
  assert.equal((await call('/api/cloud-accounts', { cookie, body: metadata, origin: 'https://evil.test' })).status, 403);
  const created = await call('/api/cloud-accounts', { cookie, body: metadata }); assert.equal(created.status, 200);
  const id = created.data.id;
  const result = await call(`/api/cloud-accounts/${id}/login`, { cookie, body: { password: 'SECRET_PASSWORD' } });
  assert.equal(result.status, 200); assert.equal(result.data.devices.length, 1); assert.equal(count(), 2);
  assert.equal((await call(`/api/cloud-accounts/${id}/logs-download`)).status, 401);
  const log = await call(`/api/cloud-accounts/${id}/logs-download`, { cookie });
  assert.equal(log.status, 200); assert.match(log.headers['content-disposition'], /attachment/);
  assert.match(log.text, /authenticated/); assert.doesNotMatch(log.text + result.text, /SECRET_PASSWORD|SYNTHETIC|NEVER_EXPOSE/);
  assert.equal((await call(`/api/cloud-accounts/${id}/command`, { cookie, body: { action: 'start' } })).status, 404);
  await call('/api/observers', { cookie, body: { username: 'observer', password: 'observer-password-1234' } });
  const session = await call('/api/login', { body: { username: 'observer', password: 'observer-password-1234' } });
  const observer = session.headers['set-cookie'][0].split(';')[0];
  assert.equal((await call('/api/cloud-accounts', { cookie: observer })).status, 403);
  assert.equal((await call(`/api/cloud-accounts/${id}/logs-download`, { cookie: observer })).status, 403);
  assert.equal((await call(`/api/cloud-accounts/${id}/login`, { cookie: observer, body: { password: 'x' } })).status, 403);
});

test('cloud UI : inventaire réel échappé, plusieurs comptes, marques planifiées et parcours Google explicite', () => {
  const source = readFileSync(new URL('./cloud.js', import.meta.url), 'utf8');
  const escape = value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const sandbox = { setInterval() {}, state: { role: 'admin', machines: [], lang: 'fr' }, live: { phase: 'workshop', page: 'cloud' }, t: fr => fr,
    esc: escape, title: (a, b, c) => a + b + c, btn: (action, label) => `<button data-action="${action}">${label}</button>`,
    app: { addEventListener() {} }, dialog: { addEventListener() {}, showModal() {}, open: false } };
  runInNewContext(source + '\nthis.renderCloud=cloudPage;this.ui=cloudUI;this.form=cloudAccountForm;', sandbox);
  sandbox.ui.data = { providers: [{ id: 'bambu', name: 'Bambu', available: true }, { id: 'creality', name: 'Creality', available: false }],
    accounts: [{ id: 'one', provider: 'bambu', name: '<script>bad</script>', email: 'x@example.com', region: 'global', status: 'connected', checkedAt: '2026-11-19', devices: [{ name: 'Printer', model: 'P2S', serial: 'SERIAL', status: 'IDLE' }] },
      { id: 'two', provider: 'creality', name: 'Planned', devices: [], status: 'disconnected', region: 'global' }] };
  sandbox.ui.data.accounts[0].telemetryEnabled = true;
  sandbox.ui.data.accounts[0].telemetry = { status: 'connected', devices: [{ serial: 'SERIAL', stale: false, checkedAt: '2026-11-19',
    heaters: [{ id: 'bed', current: 20, target: 0 }], modules: [{ model: '<script>bad</script>', serial: 'AMS_SERIAL', firmware: '1' }],
    filaments: [{ id: 0, humidity: 28, slots: [{ id: 0, occupied: true, material: 'PETG', color: '#FFFFFF' }] }] }] };
  const html = sandbox.renderCloud(); assert.doesNotMatch(html, /<script>/); assert.match(html, /Journal du compte/); assert.match(html, /20 °C/); assert.match(html, /PETG/); assert.match(html, /AMS_SERIAL/); assert.match(html, /Ajout automatique/);
  sandbox.ui.data.accounts[0].devices[0].fleetId = 'fleet-device';
  assert.match(sandbox.renderCloud(), /Supprimer de FabCore/);
  assert.match(html, /non encore intégré/); assert.doesNotMatch(html, /cloud-login:two/);
  sandbox.form(); assert.match(sandbox.dialog.innerHTML, /Adresse email cloud/); assert.doesNotMatch(sandbox.dialog.innerHTML, /Adresse email du compte constructeur/);
  sandbox.form(sandbox.ui.data.accounts[0]); assert.match(sandbox.dialog.innerHTML, /Google/); assert.match(sandbox.dialog.innerHTML, /jamais celui de Google/);
  assert.doesNotMatch(sandbox.dialog.innerHTML, /value=".*password/);
});

test('cloud : déconnexion FabCore pendant le login empêche la conservation tardive du jeton', async ctx => {
  let finish;
  const { manager, store } = await setup(ctx, async () => new Promise(resolve => { finish = resolve; }));
  const account = await manager.add(metadata);
  const attempt = manager.login(account.id, { password: 'SYNTHETIC_PASSWORD' }, 'revoked-owner');
  while (!finish) await new Promise(resolve => setImmediate(resolve)); // requête de connexion en cours
  manager.forgetOwner('revoked-owner');
  finish(Response.json({ accessToken: token }));
  await assert.rejects(attempt, /cloud-unavailable/);
  assert.equal(store.state.cloudAccounts[0].secret, undefined);
  assert.equal(manager.list().accounts[0].status, 'disconnected');
});


test('cloud : login unique déclenche directement le champ code, nouvel essai temporisé sans bloquer la vérification', async ctx => {
  let calls = 0;
  const { manager } = await setup(ctx, async (url, options) => {
    calls++;
    assert.equal(url.endsWith('/sendemail/code'), false);
    if (url.endsWith('/login')) return Response.json(JSON.parse(options.body).code ? { accessToken: token } : { loginType: 'verifyCode' });
    return Response.json(responseDevices);
  });
  const account = await manager.add(metadata);
  assert.equal((await manager.login(account.id, { password: 'SECRET_PASSWORD' }, 'owner')).challenge, 'email');
  assert.equal(calls, 1);
  await assert.rejects(manager.login(account.id, { password: 'SECRET_PASSWORD' }, 'owner'), /cloud-login-wait/);
  assert.equal(calls, 1, 'le cooldown ne provoque aucun appel constructeur');
  assert.equal(manager.list().accounts[0].challenge, 'email', 'le code reste utilisable');
  assert.equal((await manager.verify(account.id, { code: '123456' }, 'owner')).status, 'connected');
  assert.equal(calls, 3, 'login, vérification et inventaire uniquement');
});

test('cloud : suivi explicite multicomptes, jeton opaque, session partagée et fermeture', async ctx => {
  let preferenceCalls = 0; const clients = [];
  const { directory, store, manager: unused } = await setup(ctx, async () => Response.json({})); unused.close();
  const manager = createCloudAccounts({ directory, store, fetcher: async url => {
    if (url.endsWith('/login')) return Response.json({ accessToken: token });
    if (url.endsWith('/preference')) { preferenceCalls++; return Response.json({ uid: 123 }); }
    return Response.json(responseDevices);
  }, connectMqtt: (url, options) => {
    assert.equal(options.username, 'u_123'); assert.equal(options.password, token);
    const client = new EventEmitter(); client.options = options; client.ends = 0;
    client.end = () => { client.ends++; }; clients.push(client); return client;
  } }); ctx.after(() => manager.close());
  const a = await manager.add(metadata); const b = await manager.add({ ...metadata, name: 'Other' });
  await manager.login(a.id, { password: 'PRIVATE_PASSWORD' }, 'owner');
  await manager.login(b.id, { password: 'PRIVATE_PASSWORD' }, 'owner');
  assert.equal(clients.length, 0, 'aucune connexion MQTT implicite après login');
  await manager.telemetry(a.id, true); await manager.telemetry(a.id, true);
  assert.equal(clients.length, 1); assert.equal(preferenceCalls, 1);
  assert.equal(manager.list().accounts[0].telemetry.status, 'connecting');
  assert.equal(manager.list().accounts[1].telemetry, null);
  assert.doesNotMatch(JSON.stringify(manager.list()), /SYNTHETIC|PRIVATE/);
  assert.doesNotMatch(manager.logs(a.id), /SYNTHETIC|PRIVATE/);
  await manager.telemetry(a.id, false); assert.equal(clients[0].ends, 1);
  await manager.disconnect(b.id); assert.equal(store.state.cloudAccounts[1].telemetryEnabled, false);
});

test('cloud HTTP : ajout au parc, refus de doublon et suppression sans dissocier le compte', async ctx => {
  const { call, cookie } = await appSetup(ctx);
  const account = (await call('/api/cloud-accounts', { cookie, body: metadata })).data;
  await call(`/api/cloud-accounts/${account.id}/login`, { cookie, body: { password: 'SECRET_PASSWORD' } });
  assert.equal((await call(`/api/cloud-accounts/${account.id}/import`, { body: { serial: 'P2STEST123' } })).status, 401);
  const added = await call(`/api/cloud-accounts/${account.id}/import`, { cookie, body: { serial: 'P2STEST123' } });
  assert.equal(added.status, 200);
  let accounts = (await call('/api/cloud-accounts', { cookie })).data.accounts;
  assert.equal(accounts[0].devices[0].fleetId, added.data.id); assert.equal(accounts[0].devices[0].fleetMode, 'cloud');
  assert.equal((await call(`/api/cloud-accounts/${account.id}/import`, { cookie, body: { serial: 'P2STEST123' } })).status, 409);
  const machines = (await call('/api/machines', { cookie })).data.machines;
  assert.equal(machines[0].kind, 'bambu-cloud'); assert.equal(machines[0].model, 'Bambu Lab · P2S');
  assert.doesNotMatch(JSON.stringify(machines), /SYNTHETIC|PRIVATE|secret|accessCode/);
  assert.equal((await call(`/api/cloud-accounts/${account.id}/delete`, { cookie, body: {} })).data.error, 'cloud-in-use');
  assert.equal((await call('/api/machines/delete', { cookie, body: { id: added.data.id } })).status, 200);
  accounts = (await call('/api/cloud-accounts', { cookie })).data.accounts;
  assert.equal(accounts[0].devices[0].fleetId, null); assert.equal(accounts[0].devices.length, 1);
});

test('cloud : une série déjà en LAN ne devient pas une seconde machine cloud', async ctx => {
  const { manager, store } = await setup(ctx, async url => Response.json(url.endsWith('/login') ? { accessToken: token } : responseDevices));
  const account = await manager.add(metadata); await manager.login(account.id, { password: 'SECRET_PASSWORD' }, 'owner');
  store.save({ ...store.state, machines: [{ id: 'existing-lan', kind: 'bambu', serial: 'P2STEST123', name: 'LAN' }] });
  await assert.rejects(manager.importDevice(account.id, 'P2STEST123'), /cloud-machine-exists/);
  assert.equal(store.state.machines.length, 1); assert.equal(store.state.machines[0].kind, 'bambu');
});
