// Migrations versionnées (ADR 0002) : liste explicite, appliquée dans l'ordre et sous verrou par Kysely.
import { sql, type Kysely } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';
import * as initial from './migrations/0001-initial.ts';

export const migrations: Record<string, Migration> = { '0001-initial': initial };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- le migrateur ignore le schéma typé
export async function migrate(db: Kysely<any>): Promise<void> {
  // Tables de suivi dans le schéma courant : sinon Kysely retient celles d'un autre schéma de la même base.
  const schema = (await sql<{ schema: string }>`select current_schema() as schema`.execute(db)).rows[0]?.schema;
  if (!schema) throw new Error('database-schema');
  const migrator = new Migrator({ db, migrationTableSchema: schema, provider: { getMigrations: async () => migrations } });
  const { error, results } = await migrator.migrateToLatest();
  if (error) {
    const failed = results?.find(result => result.status === 'Error')?.migrationName;
    throw new Error(`database-migration${failed ? ':' + failed : ''}`, { cause: error });
  }
}
