// Connexion PostgreSQL (ADR 0002 : Kysely + pg). L'URL vient de la configuration, jamais des journaux.
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from './schema.ts';

export function openDatabase(url: string, { max = 4 }: { max?: number } = {}): { db: Kysely<Database>; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
  // Une erreur sur une connexion inactive ne doit pas arrêter le processus ; la requête suivante échouera proprement.
  pool.on('error', () => {});
  return { db: new Kysely<Database>({ dialect: new PostgresDialect({ pool }) }), pool };
}

/** Version du serveur ; PostgreSQL 16 minimum (ADR 0001). */
export async function checkServerVersion(pool: pg.Pool): Promise<number> {
  const { rows } = await pool.query<{ server_version_num: string }>('show server_version_num');
  const version = Number(rows[0]?.server_version_num);
  if (!(version >= 160000)) throw new Error('database-version');
  return version;
}
