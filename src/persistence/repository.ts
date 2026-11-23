// Lecture et écriture des lignes d'état. Écritures par différence : seules les lignes modifiées sont touchées.
import { randomUUID } from 'node:crypto';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from './schema.ts';
import type { ConnectionRow, StateRows } from './mapping.ts';

type Db = Kysely<Database> | Transaction<Database>;
const json = (value: unknown) => JSON.stringify(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const emptyRows = (): StateRows => ({ users: [], cloudAccounts: [], machines: [], connections: [], settings: [] });

export type Installation = { source: 'new' | 'state.json'; farmId: string };

export async function readInstallation(db: Db): Promise<Installation | null> {
  const row = await db.selectFrom('installation').select('source').where('id', '=', 1).executeTakeFirst();
  if (!row) return null;
  const farm = await db.selectFrom('farms').select('id').orderBy('id').executeTakeFirst();
  if (!farm) throw new Error('database-integrity');
  return { source: row.source as Installation['source'], farmId: farm.id };
}

/** Initialise l'installation et l'organisation, le site et la ferme par défaut. */
export async function createInstallation(db: Db, source: Installation['source']): Promise<Installation> {
  const organization = randomUUID(), site = randomUUID(), farm = randomUUID();
  await db.insertInto('installation').values({ id: 1, state_version: 1, source, imported_at: source === 'state.json' ? new Date() : null }).execute();
  await db.insertInto('organizations').values({ id: organization, name: 'FabCore' }).execute();
  await db.insertInto('sites').values({ id: site, organization_id: organization, name: 'Atelier' }).execute();
  await db.insertInto('farms').values({ id: farm, site_id: site, name: 'Parc' }).execute();
  return { source, farmId: farm };
}

export async function readRows(db: Db): Promise<StateRows> {
  const [users, cloudAccounts, machines, connections, settings] = await Promise.all([
    db.selectFrom('users').selectAll().execute(),
    db.selectFrom('cloud_accounts').selectAll().execute(),
    db.selectFrom('machines').select(['id', 'name', 'position', 'cloud_account_id', 'manual_spool']).execute(),
    db.selectFrom('machine_connections').selectAll().execute(),
    db.selectFrom('settings').selectAll().execute(),
  ]);
  return {
    users,
    cloudAccounts: cloudAccounts.map(row => ({ ...row, data: row.data as Record<string, unknown> })),
    machines: machines.map(row => ({ ...row, manual_spool: row.manual_spool as Record<string, unknown> | null })),
    connections: connections.map(row => ({ ...row, settings: row.settings as Record<string, unknown> })),
    settings,
  };
}

function changes<T>(before: T[], after: T[], key: (row: T) => string) {
  const previous = new Map(before.map(row => [key(row), row]));
  const next = new Set(after.map(key));
  return { removed: before.filter(row => !next.has(key(row))).map(key), changed: after.filter(row => !same(previous.get(key(row)), row)) };
}

/** Applique la différence `before` → `after` ; à appeler dans une transaction. */
export async function writeRows(db: Transaction<Database>, after: StateRows, farmId: string, before: StateRows = emptyRows()): Promise<void> {
  const users = changes(before.users, after.users, row => row.username);
  const clouds = changes(before.cloudAccounts, after.cloudAccounts, row => row.id);
  const machines = changes(before.machines, after.machines, row => row.id);
  const connections = changes(before.connections, after.connections, (row: ConnectionRow) => row.machine_id);
  const settings = changes(before.settings, after.settings, row => row.key);
  // Suppressions d'abord (machines avant comptes cloud référencés), puis insertions ou mises à jour.
  if (machines.removed.length) await db.deleteFrom('machines').where('id', 'in', machines.removed).execute();
  if (clouds.removed.length) await db.deleteFrom('cloud_accounts').where('id', 'in', clouds.removed).execute();
  if (users.removed.length) await db.deleteFrom('users').where('username', 'in', users.removed).execute();
  if (settings.removed.length) await db.deleteFrom('settings').where('key', 'in', settings.removed).execute();
  for (const row of users.changed) {
    await db.insertInto('users').values(row).onConflict(conflict => conflict.column('username').doUpdateSet(row)).execute();
  }
  for (const { data, ...row } of clouds.changed) {
    const values = { ...row, data: json(data) };
    await db.insertInto('cloud_accounts').values(values).onConflict(conflict => conflict.column('id').doUpdateSet(values)).execute();
  }
  for (const { manual_spool, ...row } of machines.changed) {
    const values = { ...row, farm_id: farmId, manual_spool: manual_spool === null ? null : json(manual_spool) };
    await db.insertInto('machines').values(values).onConflict(conflict => conflict.column('id').doUpdateSet({ ...row, manual_spool: values.manual_spool })).execute();
  }
  for (const { settings: value, ...row } of connections.changed) {
    const values = { ...row, settings: json(value) };
    await db.insertInto('machine_connections').values(values).onConflict(conflict => conflict.column('machine_id').doUpdateSet(values)).execute();
  }
  for (const row of settings.changed) {
    const values = { key: row.key, value: json(row.value) };
    await db.insertInto('settings').values(values).onConflict(conflict => conflict.column('key').doUpdateSet(values)).execute();
  }
}
