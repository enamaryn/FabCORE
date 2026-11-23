// Tests sur un vrai PostgreSQL ≥ 16 : FABCORE_TEST_DATABASE_URL (CI : service postgres). Un schéma par test.
import assert from 'node:assert/strict';
import { randomBytes, createCipheriv } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import pg from 'pg';
import type { FabCoreState } from '../application/state-store.ts';
import { openDatabase } from './database.ts';
import { importState } from './import.ts';
import { openPostgresStore } from './postgres-store.ts';
import { sampleState } from './test-fixtures.ts';

const base = process.env.FABCORE_TEST_DATABASE_URL;
const skip = base ? false : 'FABCORE_TEST_DATABASE_URL absent : tests PostgreSQL ignorés';

async function isolated(t: TestContext) {
  const schema = 'fabcore_test_' + randomBytes(6).toString('hex');
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`create schema ${schema}`);
  const url = new URL(base!);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-pg-'));
  t.after(async () => { await admin.query(`drop schema ${schema} cascade`); await admin.end(); await rm(directory, { recursive: true, force: true }); });
  return { url: url.href, directory, admin, schema };
}

test('nouvelle installation : schéma migré, état vide, sauvegardes durables et relues au redémarrage', { skip }, async t => {
  const { url, directory } = await isolated(t);
  const store = await openPostgresStore({ url, directory });
  assert.deepEqual(store.state, { version: 1, admin: null, observers: [], machines: [], cloudAccounts: [] });
  const state = sampleState();
  await store.save(state);
  await store.save({ ...state, machines: state.machines.slice(1) });
  await assert.rejects(openPostgresStore({ url, directory }), /database-in-use/, 'une seule instance par base');
  await store.close();
  const reopened = await openPostgresStore({ url, directory });
  t.after(() => reopened.close());
  assert.deepEqual(reopened.state, { ...state, machines: state.machines.slice(1) });
});

test('sauvegardes rapprochées regroupées dans l’ordre ; contrainte refusée : état et lot annulés, aucun faux succès', { skip }, async t => {
  const { url, directory } = await isolated(t);
  const store = await openPostgresStore({ url, directory });
  t.after(() => store.close());
  const state = sampleState();
  await store.save(state);
  const renamed = { ...state, machines: state.machines.map(machine => ({ ...machine, name: machine.name + '!' })) };
  const first = store.save({ ...state, notifications: { ntfy: { enabled: true } } });
  const second = store.save(renamed);
  await Promise.all([first, second]);
  assert.deepEqual(store.state, renamed);
  // Deux machines LAN à la même adresse : refusé par l'index unique, l'état mémoire revient au dernier état durable.
  const duplicate = { ...renamed, machines: [...renamed.machines, { ...renamed.machines[0]!, id: '77777777-7777-4777-8777-777777777777', serial: 'AUTRE' }] };
  const failing = store.save(duplicate);
  assert.equal(store.state, duplicate, 'visible aussitôt pour les lectures synchrones');
  const following = store.save({ ...duplicate, notifications: {} });
  await assert.rejects(failing, /storage-unavailable/);
  await assert.rejects(following, /storage-unavailable/, 'bâtie sur l’état refusé');
  assert.deepEqual(store.state, renamed);
  // Compte cloud encore utilisé par une machine : suppression refusée par la clé étrangère.
  await assert.rejects(store.save({ ...renamed, cloudAccounts: [] }), /storage-unavailable/);
  await store.save({ ...renamed, machines: renamed.machines.slice(0, 2), cloudAccounts: [] });
  assert.equal(store.state.cloudAccounts?.length, 0);
});

test('import state.json : simulation sans écriture, application, idempotence, base différente bloquée, secrets lisibles', { skip }, async t => {
  const { url, directory } = await isolated(t);
  const key = randomBytes(32);
  const state = sampleState();
  const account = state.cloudAccounts![0]!;
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(account.id));
  account.secret = Buffer.concat([iv, cipher.update('jeton'), cipher.final(), cipher.getAuthTag()]).toString('base64');
  const { db } = openDatabase(url);
  t.after(() => db.destroy());
  const simulated = await importState(db, state, { cloudKey: key });
  assert.equal(simulated.status, 'simulated');
  assert.equal(simulated.verified, true);
  assert.deepEqual(simulated.counts, { admin: 1, observers: 1, machines: 4, cloudAccounts: 1, settings: 1 });
  assert.equal(await db.selectFrom('installation').selectAll().executeTakeFirst(), undefined, 'simulation annulée');
  const wrongKey = await importState(db, state, { cloudKey: randomBytes(32) });
  assert.deepEqual(wrongKey.anomalies, [{ code: 'cloud-secret-unreadable', path: 'cloudAccounts[0].secret', blocking: false }]);
  assert.equal((await importState(db, state, { apply: true, cloudKey: key })).status, 'imported');
  assert.equal((await importState(db, state, { apply: true, cloudKey: key })).status, 'already-imported', 'idempotent');
  const changed = { ...state, machines: state.machines.slice(1) } as FabCoreState;
  const blocked = await importState(db, changed, { apply: true });
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.anomalies.at(-1), { code: 'database-not-empty', path: '$', blocking: true });
  // Le magasin démarre sur la base importée ; mot de passe haché et secret chiffré inchangés.
  await writeFile(join(directory, 'state.json'), JSON.stringify(state));
  const store = await openPostgresStore({ url, directory });
  t.after(() => store.close());
  assert.deepEqual(store.state.admin, state.admin);
  assert.equal(store.state.cloudAccounts?.[0]?.secret, account.secret);
});

test('base vide à côté d’un state.json : démarrage refusé tant que l’import n’est pas fait', { skip }, async t => {
  const { url, directory } = await isolated(t);
  await writeFile(join(directory, 'state.json'), JSON.stringify(sampleState()));
  await assert.rejects(openPostgresStore({ url, directory }), /database-import-required/);
  const reopened = await openPostgresStore({ url, directory }).catch(error => error as Error);
  assert.match(String(reopened), /database-import-required/, 'verrou libéré après refus');
});
