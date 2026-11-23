// Connexion PostgreSQL (ADR 0002 : Kysely + pg). L'URL vient de la configuration, jamais des journaux.
import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from './schema.ts';
import { pgSsl, type DatabaseConfig } from '../config/database.ts';

/** Ouvre le pool à partir de la configuration validée (src/config/database.ts) ou d'une URL seule. */
export function openDatabase(source: string | DatabaseConfig, { max }: { max?: number } = {}): { db: Kysely<Database>; pool: pg.Pool } {
  const config: DatabaseConfig = typeof source === 'string' ? { url: source, poolMax: 4, connectTimeoutMs: 10_000 } : source;
  const ssl = pgSsl(config);
  const pool = new pg.Pool({ connectionString: config.url, max: max ?? config.poolMax, connectionTimeoutMillis: config.connectTimeoutMs, idleTimeoutMillis: 30_000, ...(ssl === undefined ? {} : { ssl }) });
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
