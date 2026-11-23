import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ConfigError, loadDatabaseConfig, pgSsl } from './database.ts';

const url = 'postgresql://fabcore:secret@db.example.test:5432/fabcore';
const fails = (code: string, variable: string) => (error: unknown) => error instanceof ConfigError && error.message === code && error.variable === variable && !String(error).includes('secret');

test('configuration : absente, valeurs par défaut, priorité environnement puis fichier 0600', t => {
  const directory = mkdtempSync(join(tmpdir(), 'fabcore-config-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.equal(loadDatabaseConfig({}), null, 'sans URL : state.json');
  assert.deepEqual(loadDatabaseConfig({ FABCORE_DATABASE_URL: url }), { url, poolMax: 4, connectTimeoutMs: 10_000 });
  const file = join(directory, 'database.env');
  writeFileSync(file, `# commentaire\nexport FABCORE_DATABASE_URL="${url}"\nFABCORE_DATABASE_SSL=verify-full\nFABCORE_DATABASE_POOL_MAX=8\n`, { mode: 0o600 });
  assert.deepEqual(loadDatabaseConfig({ FABCORE_CONFIG: file }), { url, ssl: 'verify-full', poolMax: 8, connectTimeoutMs: 10_000 });
  assert.equal(loadDatabaseConfig({ FABCORE_CONFIG: file, FABCORE_DATABASE_POOL_MAX: '3' })?.poolMax, 3, 'environnement prioritaire');
  chmodSync(file, 0o640);
  assert.throws(() => loadDatabaseConfig({ FABCORE_CONFIG: file }), fails('config-permissions', 'FABCORE_CONFIG'));
  assert.throws(() => loadDatabaseConfig({ FABCORE_CONFIG: join(directory, 'absent.env') }), fails('config-missing', 'FABCORE_CONFIG'));
});

test('configuration : valeurs invalides refusées avec le nom de la variable, sans secret', () => {
  assert.throws(() => loadDatabaseConfig({ FABCORE_DATABASE_URL: 'mysql://x' }), fails('config-invalid', 'FABCORE_DATABASE_URL'));
  assert.throws(() => loadDatabaseConfig({ FABCORE_DATABASE_URL: url, FABCORE_DATABASE_SSL: 'peut-être' }), fails('config-invalid', 'FABCORE_DATABASE_SSL'));
  assert.throws(() => loadDatabaseConfig({ FABCORE_DATABASE_URL: url, FABCORE_DATABASE_POOL_MAX: '1000' }), fails('config-invalid', 'FABCORE_DATABASE_POOL_MAX'));
  assert.throws(() => loadDatabaseConfig({ FABCORE_DATABASE_URL: url + '?sslmode=require', FABCORE_DATABASE_SSL: 'disable' }), fails('config-ssl-conflict', 'FABCORE_DATABASE_SSL'));
  assert.throws(() => loadDatabaseConfig({ FABCORE_DATABASE_URL: url, FABCORE_DATABASE_SSL: 'require', FABCORE_DATABASE_CA_FILE: '/etc/ca.pem' }), fails('config-invalid', 'FABCORE_DATABASE_CA_FILE'));
});

test('TLS : options du pilote selon le mode', t => {
  const directory = mkdtempSync(join(tmpdir(), 'fabcore-ca-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const base = { url, poolMax: 4, connectTimeoutMs: 10_000 };
  assert.equal(pgSsl(base), undefined);
  assert.equal(pgSsl({ ...base, ssl: 'disable' }), false);
  assert.deepEqual(pgSsl({ ...base, ssl: 'require' }), { rejectUnauthorized: false });
  writeFileSync(join(directory, 'ca.pem'), 'PEM');
  assert.deepEqual(pgSsl({ ...base, ssl: 'verify-full', caFile: join(directory, 'ca.pem') }), { rejectUnauthorized: true, ca: 'PEM' });
  assert.throws(() => pgSsl({ ...base, ssl: 'verify-full', caFile: join(directory, 'absent.pem') }), fails('config-ca-unreadable', 'FABCORE_DATABASE_CA_FILE'));
});
