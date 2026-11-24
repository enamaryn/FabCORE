import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createCloudAccounts } from './cloud-accounts.mjs';
import { openStore } from './store.mjs';
import { streamCloudCamera } from './bambu-cloud-camera.mjs';
const machine = { id: 'machine', kind: 'bambu-cloud', serial: 'P2STEST12', cloudAccountId: 'account', camera: { mode: 'auto', host: '192.168.1.20' } };
test('Caméra hybride : compte Cloud, transport LAN et secret uniquement côté serveur ; désactivation sans accès réseau', async () => {
  let calls = 0; const traces = [];
  const cloud = { async cameraConnection(m) { assert.equal(m, machine); calls++; return { accessCode: 'ABCD1234', authorized: () => true }; } };
  const stream = async (m, _output, _signal, frame) => { assert.equal(m.origin, 'mqtts://192.168.1.20:8883'); assert.equal(m.accessCode, 'ABCD1234'); frame(); return true; };
  const options = { cloud, enabled: true, stream, diagnostics: { trace: (...args) => traces.push(args) } };
  assert.equal(await streamCloudCamera(machine, {}, new AbortController().signal, () => {}, options), undefined); assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(traces), /ABCD1234|token|password/);
  assert.equal(await streamCloudCamera(machine, {}, new AbortController().signal, () => {}, { ...options, enabled: false }), 'camera-experimental-disabled');
  assert.equal(await streamCloudCamera({ ...machine, camera: { mode: 'cloud' } }, {}, new AbortController().signal, () => {}, options), 'camera-cloud-unqualified'); assert.equal(calls, 1);
});
test('Caméra hybride : révocation du compte arrête le flux actif, aucune reconnexion automatique', async () => {
  let authorized = true, calls = 0;
  const cloud = { async cameraConnection() { return { accessCode: 'ABCD1234', authorized: () => authorized }; } };
  const task = streamCloudCamera(machine, {}, new AbortController().signal, () => {}, { cloud, enabled: true, stream: async (_m, _o, signal) => { calls++; authorized = false; await delay(1200); assert.equal(signal.aborted, true); return false; } });
  assert.equal(await task, 'camera-unavailable'); assert.equal(calls, 1);
});
test('Compte : credentials caméra éphémères liés à la série et au compte, aucune fuite publique ni persistance', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-cloud-camera-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = openStore(directory); let binds = 0;
  const manager = createCloudAccounts({ directory, store, fetcher: async url => {
    if (url.endsWith('/login')) return Response.json({ accessToken: 'TEST.private.token' });
    binds++; return Response.json({ devices: [{ dev_id: machine.serial, name: 'P2S', dev_product_name: 'P2S', dev_access_code: 'ABCD1234' }] });
  } }); t.after(() => manager.close());
  const account = await manager.add({ provider: 'bambu', name: 'Test', email: 'test@example.com', region: 'global' });
  await manager.login(account.id, { password: 'test-password' }, 'owner');
  const target = { ...machine, cloudAccountId: account.id }; await store.save({ ...store.state, machines: [target] });
  const [first, second] = await Promise.all([manager.cameraConnection(target), manager.cameraConnection(target)]);
  assert.equal(first.accessCode, 'ABCD1234'); assert.equal(second.accessCode, 'ABCD1234'); assert.equal(binds, 2, 'one login inventory, one shared credential inventory');
  assert.equal(first.authorized(), true); assert.doesNotMatch(JSON.stringify(manager.list()), /ABCD1234/); assert.doesNotMatch(JSON.stringify(store.state), /ABCD1234/); assert.doesNotMatch(manager.logs(account.id), /ABCD1234/);
  await store.save({ ...store.state, machines: [{ ...target, name: 'renamed' }] }); assert.equal(first.authorized(), true, 'unrelated metadata does not disconnect video');
  await store.save({ ...store.state, machines: [{ ...target, camera: { mode: 'lan', host: '192.168.1.21' } }] }); assert.equal(first.authorized(), false, 'camera target change revokes old session');
  await assert.rejects(manager.cameraConnection({ ...target, serial: 'foreign' }), /cloud-auth/);
  await manager.disconnect(account.id); assert.equal(first.authorized(), false); await assert.rejects(manager.cameraConnection(target), /cloud-auth/);
});

test('Compte : refus Cloud temporisé aussi, sans rafale de nouvelles requêtes caméra', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-camera-rate-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const store = openStore(directory); let binds = 0, now = 1000;
  const manager = createCloudAccounts({ directory, store, now: () => now, fetcher: async url => {
    if (url.endsWith('/login')) return Response.json({ accessToken: 'TEST.private.token' });
    binds++; return binds === 1 ? Response.json({ devices: [{ dev_id: machine.serial, name: 'P2S' }] }) : Response.json({}, { status: 429 });
  } }); t.after(() => manager.close());
  const account = await manager.add({ provider: 'bambu', name: 'Test', email: 'test@example.com', region: 'global' }); await manager.login(account.id, { password: 'test-password' }, 'owner');
  const target = { ...machine, cloudAccountId: account.id }; await store.save({ ...store.state, machines: [target] });
  await assert.rejects(manager.cameraConnection(target), /cloud-rate/); await assert.rejects(manager.cameraConnection(target), /cloud-rate/); assert.equal(binds, 2);
  now += 31000; await assert.rejects(manager.cameraConnection(target), /cloud-rate/); assert.equal(binds, 3);
});
