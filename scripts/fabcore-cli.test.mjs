// Commande `fabcore` : sauvegarde, vérification et restauration, en JSON puis sur PostgreSQL réel
// (FABCORE_TEST_DATABASE_URL). Aucun service systemd touché (FABCORE_SERVICE=none).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const script = new URL('./fabcore.sh', import.meta.url).pathname;
function sandbox(t) {
  const root = mkdtempSync(join(tmpdir(), 'fabcore-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const data = join(root, 'data');
  mkdirSync(join(data, 'files'), { recursive: true });
  writeFileSync(join(data, 'state.json'), JSON.stringify({ version: 1, admin: { username: 'atelier', salt: 'aa', hash: 'bb' }, machines: [] }));
  writeFileSync(join(data, 'files', 'piece.gcode'), 'G28\n');
  const env = { PATH: process.env.PATH, HOME: root, FABCORE_SERVICE: 'none', FABCORE_DATA: data, FABCORE_BACKUPS: join(root, 'backups'), FABCORE_BACKUP_KEEP: '3' };
  const run = (args, extra = {}) => spawnSync('bash', [script, ...args], { env: { ...env, ...extra }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const archives = () => readdirSync(env.FABCORE_BACKUPS).filter(name => name.endsWith('.tar.gz')).sort();
  return { root, data, env, run, archives };
}

test('fabcore backup/restore (JSON) : empreinte, vérification sans effet, confirmation, copie préalable, rétention', t => {
  const { data, env, run, archives } = sandbox(t);
  const first = run(['backup']);
  assert.equal(first.status, 0, first.stderr);
  const [archive] = archives().map(name => join(env.FABCORE_BACKUPS, name));
  assert.match(readFileSync(archive + '.sha256', 'utf8'), /^[0-9a-f]{64} {2}fabcore-backup-/);
  writeFileSync(join(data, 'files', 'piece.gcode'), 'modifié');
  const check = run(['restore', archive, '--check']);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /Archive valide \(json/);
  assert.equal(readFileSync(join(data, 'files', 'piece.gcode'), 'utf8'), 'modifié', '--check ne modifie rien');
  const unconfirmed = run(['restore', archive]);
  assert.equal(unconfirmed.status, 1);
  assert.match(unconfirmed.stderr, /--yes/);
  const restored = run(['restore', archive, '--yes']);
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(readFileSync(join(data, 'files', 'piece.gcode'), 'utf8'), 'G28\n');
  assert.ok(archives().some(name => name.includes('avant-restauration')), 'état précédent sauvegardé');
  appendFileSync(archive, 'x');
  const altered = run(['restore', archive, '--check']);
  assert.equal(altered.status, 1);
  assert.match(altered.stderr, /archive altérée/);
  for (let index = 0; index < 4; index++) assert.equal(run(['backup']).status, 0);
  assert.equal(archives().length, 3, 'FABCORE_BACKUP_KEEP respecté');
  assert.equal(run(['inconnue']).status, 2);
  assert.match(run(['help']).stdout, /restore <archive> \[--check\]/);
});

const base = process.env.FABCORE_TEST_DATABASE_URL;
const skip = base && spawnSync('pg_dump', ['--version']).status === 0 ? false : 'PostgreSQL de test ou pg_dump absent';

test('fabcore import/backup/restore (PostgreSQL) : base restaurée en une transaction, refus si FabCore tourne ou schéma différent', { skip }, async t => {
  const { run, archives, env } = sandbox(t);
  const schema = 'fabcore_cli_' + randomBytes(5).toString('hex');
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`create schema ${schema}`);
  t.after(async () => { await admin.query(`drop schema ${schema} cascade`); await admin.end(); });
  const url = new URL(base); url.searchParams.set('options', `-c search_path=${schema}`);
  const database = { FABCORE_DATABASE_URL: url.href };
  assert.equal(run(['import', '--apply'], database).status, 0);
  const backup = run(['backup'], database);
  assert.equal(backup.status, 0, backup.stderr);
  assert.doesNotMatch(backup.stdout + backup.stderr, /postgres:\/\//, 'URL jamais affichée');
  const archive = join(env.FABCORE_BACKUPS, archives()[0]);
  assert.match(run(['restore', archive, '--check']).stderr, /configurer FABCORE_DATABASE_URL/);
  await admin.query(`insert into ${schema}.settings values ('ajout', '1'::jsonb)`);
  // Une instance tient le verrou : restauration refusée avant toute modification.
  const holder = new pg.Client({ connectionString: url.href });
  await holder.connect();
  await holder.query("select pg_advisory_lock(hashtext('fabcore:' || current_database() || '.' || current_schema()))");
  const busy = run(['restore', archive, '--yes'], database);
  assert.equal(busy.status, 1);
  assert.match(busy.stderr, /rien n’a été modifié/);
  await holder.end();
  const restored = run(['restore', archive, '--yes'], database);
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal((await admin.query(`select count(*)::int as n from ${schema}.settings`)).rows[0].n, 0);
  assert.equal((await admin.query(`select count(*)::int as n from ${schema}.users`)).rows[0].n, 1);
  const other = new URL(base);
  const wrong = run(['restore', archive, '--yes'], { FABCORE_DATABASE_URL: other.href });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /schéma/);
});
