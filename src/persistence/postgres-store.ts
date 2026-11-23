// Magasin d'état PostgreSQL : même contrat que `poc/store.mjs`. L'état est chargé en mémoire au démarrage et
// lu de façon synchrone ; chaque `save` est rendu visible aussitôt, puis écrit par différence dans une
// transaction. Les sauvegardes rapprochées sont regroupées ; un échec annule l'état en mémoire jusqu'au
// dernier état durable et rejette toutes les sauvegardes du lot (aucun faux succès).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import type { FabCoreState, StateStore } from '../application/state-store.ts';
import { checkServerVersion, openDatabase } from './database.ts';
import { rowsToState, stateToRows, type StateRows } from './mapping.ts';
import { migrate } from './migrate.ts';
import { createInstallation, readInstallation, readRows, writeRows } from './repository.ts';

export type PostgresStore = Omit<StateStore, 'save' | 'close'> & { save(next: FabCoreState): Promise<void>; close(): Promise<void> };

function assertState(next: FabCoreState) {
  if (next?.version !== 1 || !Array.isArray(next.machines) || !Object.hasOwn(next, 'admin')) throw new Error('Format de stockage FabCore inconnu.');
}

export async function openPostgresStore({ url, directory }: { url: string; directory: string }): Promise<PostgresStore> {
  const { db, pool } = openDatabase(url);
  let lock: pg.PoolClient | null = null;
  try {
    await checkServerVersion(pool);
    // Verrou consultatif tenu pendant toute la vie du processus : une seule instance FabCore par base et schéma.
    lock = await pool.connect();
    const { rows } = await lock.query<{ locked: boolean }>("select pg_try_advisory_lock(hashtext('fabcore:' || current_database() || '.' || current_schema())) as locked");
    if (!rows[0]?.locked) throw new Error('database-in-use');
    await migrate(db);
    let installation = await readInstallation(db);
    if (!installation) {
      // Ne jamais démarrer une installation vide à côté de données JSON existantes : l'import est explicite.
      if (existsSync(join(directory, 'state.json'))) throw new Error('database-import-required');
      installation = await db.transaction().execute(trx => createInstallation(trx, 'new'));
    }
    const farmId = installation.farmId;
    let committed = rowsToState(await readRows(db));
    let committedRows: StateRows = stateToRows(committed);
    let state = committed;
    let waiting: { resolve(): void; reject(error: Error): void }[] = [];
    let writing: Promise<void> | null = null;
    let closed = false;

    async function flush() {
      while (waiting.length) {
        const batch = waiting;
        waiting = [];
        const snapshot = state, rows = stateToRows(snapshot);
        try {
          await db.transaction().execute(trx => writeRows(trx, rows, farmId, committedRows));
          committed = snapshot; committedRows = rows;
          for (const entry of batch) entry.resolve();
        } catch (cause) {
          // Les sauvegardes arrivées pendant l'écriture reposaient sur l'état refusé : elles échouent aussi.
          state = committed;
          const failed = [...batch, ...waiting];
          waiting = [];
          for (const entry of failed) entry.reject(new Error('storage-unavailable', { cause }));
        }
      }
      writing = null;
    }

    return {
      get state() { return state; },
      save(next: FabCoreState) {
        if (closed) return Promise.reject(new Error('storage-unavailable'));
        assertState(next);
        state = next;
        const done = new Promise<void>((resolve, reject) => waiting.push({ resolve, reject }));
        writing ??= flush();
        return done;
      },
      async close() {
        if (closed) return;
        closed = true;
        await writing;
        lock?.release();
        await db.destroy();
      },
    };
  } catch (error) {
    lock?.release();
    await db.destroy();
    throw error;
  }
}
