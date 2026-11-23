// MIG-04.2 · import de `state.json` dans PostgreSQL. Simulation par défaut (transaction annulée), puis
// application transactionnelle et idempotente. Le rapport ne contient ni secret ni valeur de champ :
// codes, chemins (`machines[2].origin`) et comptes.
import { createDecipheriv } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Kysely } from 'kysely';
import type { FabCoreState } from '../application/state-store.ts';
import type { Database } from './schema.ts';
import { canonicalState, rowsToState, stateToRows } from './mapping.ts';
import { migrate } from './migrate.ts';
import { createInstallation, readInstallation, readRows, writeRows } from './repository.ts';

export type Anomaly = { code: string; path: string; blocking: boolean };
export type ImportReport = {
  status: 'simulated' | 'imported' | 'already-imported' | 'blocked';
  counts: { admin: number; observers: number; machines: number; cloudAccounts: number; settings: number };
  anomalies: Anomaly[];
  verified: boolean;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown, max = 4096) => typeof value === 'string' && value.length > 0 && value.length <= max;
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Vérifie la forme et les relations ; les anomalies bloquantes empêchent l'import. */
export function inspectState(raw: unknown, { cloudKey }: { cloudKey?: Buffer | null } = {}): { state: FabCoreState | null; anomalies: Anomaly[] } {
  const anomalies: Anomaly[] = [];
  const add = (code: string, path: string, blocking = true) => anomalies.push({ code, path, blocking });
  if (!object(raw) || raw.version !== 1 || !Array.isArray(raw.machines) || !Object.hasOwn(raw, 'admin')) {
    add('state-format', '$');
    return { state: null, anomalies };
  }
  const account = (value: unknown, path: string) => {
    if (!object(value) || !text(value.username, 40) || !text(value.salt) || !text(value.hash)) add('account-invalid', path);
    else if (Object.keys(value).some(key => !['username', 'salt', 'hash'].includes(key))) add('account-fields', path);
  };
  if (raw.admin !== null) account(raw.admin, 'admin');
  const observers = raw.observers ?? [];
  if (!Array.isArray(observers)) add('observers-invalid', 'observers');
  else observers.forEach((entry, index) => account(entry, `observers[${index}]`));
  const usernames = [raw.admin, ...(Array.isArray(observers) ? observers : [])].filter(object).map(entry => entry.username);
  usernames.forEach((name, index) => { if (usernames.indexOf(name) !== index) add('account-duplicate', index === 0 ? 'admin' : `observers[${index - 1}]`); });
  if (raw.admin === null && usernames.length) add('observers-without-admin', 'observers');

  const clouds = raw.cloudAccounts ?? [];
  const cloudIds = new Set<string>();
  if (!Array.isArray(clouds)) add('cloud-accounts-invalid', 'cloudAccounts');
  else clouds.forEach((entry, index) => {
    const path = `cloudAccounts[${index}]`;
    if (!object(entry) || !text(entry.id) || !uuid.test(entry.id as string) || !text(entry.provider, 40) || typeof entry.name !== 'string') { add('cloud-account-invalid', path); return; }
    if (cloudIds.has(entry.id as string)) add('cloud-account-duplicate', path);
    cloudIds.add(entry.id as string);
    // Le jeton chiffré doit rester lisible avec la clé du dossier de données (AES-256-GCM, AAD = identifiant).
    if (typeof entry.secret === 'string') {
      if (!cloudKey) add('cloud-key-missing', path + '.secret', false);
      else try {
        const data = Buffer.from(entry.secret, 'base64');
        const decipher = createDecipheriv('aes-256-gcm', cloudKey, data.subarray(0, 12));
        decipher.setAAD(Buffer.from(entry.id as string)); decipher.setAuthTag(data.subarray(-16));
        decipher.update(data.subarray(12, -16)); decipher.final();
      } catch { add('cloud-secret-unreadable', path + '.secret', false); }
    }
  });

  const ids = new Set<string>(), origins = new Map<string, number>(), serials = new Map<string, number>();
  (raw.machines as unknown[]).forEach((entry, index) => {
    const path = `machines[${index}]`;
    if (!object(entry) || !text(entry.id) || !uuid.test(entry.id as string) || typeof entry.name !== 'string' || !text(entry.origin)) { add('machine-invalid', path); return; }
    if (entry.kind !== undefined && typeof entry.kind !== 'string') add('machine-kind', path + '.kind', false);
    if (ids.has(entry.id as string)) add('machine-duplicate-id', path + '.id');
    ids.add(entry.id as string);
    const kind = typeof entry.kind === 'string' ? entry.kind : 'klipper';
    if (kind !== 'bambu-cloud') {
      if (origins.has(entry.origin as string)) add('machine-duplicate-origin', path + '.origin');
      origins.set(entry.origin as string, index);
    }
    if (typeof entry.serial === 'string') {
      const key = (['bambu', 'bambu-cloud'].includes(kind) ? 'bambu' : kind) + '\0' + entry.serial;
      if (serials.has(key)) add('machine-duplicate-serial', path + '.serial');
      serials.set(key, index);
    }
    if (entry.cloudAccountId !== undefined && !(typeof entry.cloudAccountId === 'string' && cloudIds.has(entry.cloudAccountId))) add('machine-cloud-account', path + '.cloudAccountId');
  });
  return { state: anomalies.some(item => item.blocking) ? null : raw as FabCoreState, anomalies };
}

const countsOf = (state: FabCoreState | null): ImportReport['counts'] => ({
  admin: state?.admin ? 1 : 0, observers: state?.observers?.length ?? 0, machines: state?.machines.length ?? 0,
  cloudAccounts: state?.cloudAccounts?.length ?? 0, settings: state ? stateToRows(state).settings.length : 0,
});

class Simulation extends Error {}

export function readCloudKey(directory: string): Buffer | null {
  try { const key = readFileSync(join(directory, 'cloud-secret.key')); return key.length === 32 ? key : null; }
  catch { return null; }
}

/**
 * Importe `raw` (contenu de `state.json`). `apply: false` : tout est écrit puis annulé, contraintes comprises.
 * Base déjà importée avec le même contenu : `already-imported`, aucune écriture. Base différente : `blocked`.
 */
export async function importState(db: Kysely<Database>, raw: unknown, { apply = false, cloudKey = null }: { apply?: boolean; cloudKey?: Buffer | null } = {}): Promise<ImportReport> {
  const { state, anomalies } = inspectState(raw, { cloudKey });
  const report = (status: ImportReport['status'], verified = false): ImportReport => ({ status, counts: countsOf(state), anomalies, verified });
  if (!state) return report('blocked');
  await migrate(db);
  const installation = await readInstallation(db);
  if (installation) {
    const current = rowsToState(await readRows(db));
    if (isDeepStrictEqual(canonicalState(current), canonicalState(JSON.parse(JSON.stringify(state))))) return report('already-imported', true);
    anomalies.push({ code: 'database-not-empty', path: '$', blocking: true });
    return report('blocked');
  }
  try {
    await db.transaction().execute(async trx => {
      const { farmId } = await createInstallation(trx, 'state.json');
      await writeRows(trx, stateToRows(state), farmId);
      // Relecture dans la transaction : comptes, machines et relations identiques avant validation.
      const written = rowsToState(await readRows(trx));
      if (!isDeepStrictEqual(canonicalState(written), canonicalState(JSON.parse(JSON.stringify(state))))) throw new Error('import-mismatch');
      if (!apply) throw new Simulation();
    });
  } catch (error) {
    if (error instanceof Simulation) return report('simulated', true);
    const constraint = (error as { constraint?: unknown }).constraint;
    if (typeof constraint === 'string') { anomalies.push({ code: 'database-constraint', path: constraint, blocking: true }); return report('blocked'); }
    throw error;
  }
  return report('imported', true);
}
