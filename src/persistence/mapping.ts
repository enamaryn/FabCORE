// Correspondance sans perte entre l'état d'installation (`state.json`) et les lignes PostgreSQL.
// Règle : une colonne ne reçoit un champ que si son type correspond ; tout le reste est conservé en JSON
// (`settings` de la connexion, `data` du compte cloud, table `settings` pour les clés d'état inconnues).
import type { Account, CloudAccountRecord, FabCoreState, MachineRecord } from '../application/state-store.ts';

export type UserRow = { username: string; role: 'admin' | 'observer'; password_salt: string; password_hash: string; position: number };
export type CloudAccountRow = { id: string; provider: string; name: string; position: number; data: Record<string, unknown> };
export type MachineRow = { id: string; name: string; position: number; cloud_account_id: string | null; manual_spool: Record<string, unknown> | null };
export type ConnectionRow = { machine_id: string; kind: string | null; origin: string; serial: string | null; settings: Record<string, unknown> };
export type SettingRow = { key: string; value: unknown };
export type StateRows = { users: UserRow[]; cloudAccounts: CloudAccountRow[]; machines: MachineRow[]; connections: ConnectionRow[]; settings: SettingRow[] };

const known = new Set(['version', 'admin', 'observers', 'machines', 'cloudAccounts']);
const plainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const user = (account: Account, role: UserRow['role'], position: number): UserRow =>
  ({ username: account.username, role, password_salt: account.salt, password_hash: account.hash, position });

export function stateToRows(state: FabCoreState): StateRows {
  const users = [...(state.admin ? [user(state.admin, 'admin', 0)] : []), ...(state.observers ?? []).map((account, index) => user(account, 'observer', index + 1))];
  const cloudAccounts = (state.cloudAccounts ?? []).map(({ id, provider, name, ...data }, position) => ({ id, provider, name, position, data }));
  const machines: MachineRow[] = [];
  const connections: ConnectionRow[] = [];
  state.machines.forEach((machine, position) => {
    const { id, name, origin, kind, serial, cloudAccountId, manualSpool, ...rest } = machine;
    const settings: Record<string, unknown> = { ...rest };
    if (kind !== undefined && typeof kind !== 'string') settings.kind = kind;
    if (serial !== undefined && typeof serial !== 'string') settings.serial = serial;
    if (cloudAccountId !== undefined && typeof cloudAccountId !== 'string') settings.cloudAccountId = cloudAccountId;
    if ('manualSpool' in machine && !plainObject(manualSpool)) settings.manualSpool = manualSpool;
    machines.push({ id, name, position, cloud_account_id: typeof cloudAccountId === 'string' ? cloudAccountId : null, manual_spool: plainObject(manualSpool) ? manualSpool : null });
    connections.push({ machine_id: id, kind: typeof kind === 'string' ? kind : null, origin, serial: typeof serial === 'string' ? serial : null, settings });
  });
  const settings = Object.entries(state).filter(([key]) => !known.has(key)).map(([key, value]) => ({ key, value }));
  return { users, cloudAccounts, machines, connections, settings };
}

export function rowsToState(rows: StateRows): FabCoreState {
  const byPosition = <T extends { position: number }>(items: T[]) => [...items].sort((a, b) => a.position - b.position);
  const users = byPosition(rows.users);
  const account = (row: UserRow): Account => ({ username: row.username, salt: row.password_salt, hash: row.password_hash });
  const admin = users.find(row => row.role === 'admin');
  const connections = new Map(rows.connections.map(row => [row.machine_id, row]));
  const machines = byPosition(rows.machines).map((row): MachineRecord => {
    const connection = connections.get(row.id);
    if (!connection) throw new Error('database-integrity');
    return {
      id: row.id, name: row.name, ...(connection.kind !== null ? { kind: connection.kind } : {}), origin: connection.origin,
      ...(connection.serial !== null ? { serial: connection.serial } : {}),
      ...(row.cloud_account_id !== null ? { cloudAccountId: row.cloud_account_id } : {}),
      ...(row.manual_spool !== null ? { manualSpool: row.manual_spool } : {}),
      ...connection.settings,
    };
  });
  const cloudAccounts = byPosition(rows.cloudAccounts).map(({ id, provider, name, data }): CloudAccountRecord => ({ id, provider, name, ...data }));
  const extra = Object.fromEntries(rows.settings.map(row => [row.key, row.value]));
  return { ...extra, version: 1, admin: admin ? account(admin) : null, observers: users.filter(row => row.role === 'observer').map(account), machines, cloudAccounts };
}

/** Forme canonique pour comparer avant/après : listes absentes équivalentes à des listes vides. */
export function canonicalState(state: FabCoreState): FabCoreState {
  return { ...state, observers: state.observers ?? [], cloudAccounts: state.cloudAccounts ?? [] };
}
