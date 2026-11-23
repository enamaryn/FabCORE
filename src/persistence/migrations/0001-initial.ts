// MIG-04.1 · schéma initial. Identifiants de `state.json` conservés (UUID machines et comptes cloud).
import { sql, type Kysely } from 'kysely';

// Les migrations s'écrivent sans le schéma typé, qui décrit l'état final et non chaque étape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export async function up(db: AnyDb): Promise<void> {
  // Une seule ligne : marque une installation initialisée (création ou import) et la version d'état d'origine.
  await db.schema.createTable('installation')
    .addColumn('id', 'integer', column => column.primaryKey().check(sql`id = 1`))
    .addColumn('state_version', 'integer', column => column.notNull())
    .addColumn('source', 'text', column => column.notNull().check(sql`source in ('new', 'state.json')`))
    .addColumn('created_at', 'timestamptz', column => column.notNull().defaultTo(sql`now()`))
    .addColumn('imported_at', 'timestamptz')
    .execute();
  // Organisation / site / ferme : un ensemble par défaut à l'initialisation ; le multi-site viendra plus tard.
  await db.schema.createTable('organizations')
    .addColumn('id', 'uuid', column => column.primaryKey())
    .addColumn('name', 'text', column => column.notNull())
    .execute();
  await db.schema.createTable('sites')
    .addColumn('id', 'uuid', column => column.primaryKey())
    .addColumn('organization_id', 'uuid', column => column.notNull().references('organizations.id').onDelete('restrict'))
    .addColumn('name', 'text', column => column.notNull())
    .execute();
  await db.schema.createTable('farms')
    .addColumn('id', 'uuid', column => column.primaryKey())
    .addColumn('site_id', 'uuid', column => column.notNull().references('sites.id').onDelete('restrict'))
    .addColumn('name', 'text', column => column.notNull())
    .execute();
  // Comptes locaux : hachage scrypt et sel conservés tels quels ; un seul administrateur.
  await db.schema.createTable('users')
    .addColumn('username', 'text', column => column.primaryKey())
    .addColumn('role', 'text', column => column.notNull().check(sql`role in ('admin', 'observer')`))
    .addColumn('password_salt', 'text', column => column.notNull())
    .addColumn('password_hash', 'text', column => column.notNull())
    .addColumn('position', 'integer', column => column.notNull())
    .execute();
  await db.schema.createIndex('users_single_admin').on('users').column('role').unique().where(sql.ref('role'), '=', 'admin').execute();
  // Comptes cloud : le jeton reste chiffré (AES-256-GCM) avec la clé `cloud-secret.key` du dossier de données.
  await db.schema.createTable('cloud_accounts')
    .addColumn('id', 'uuid', column => column.primaryKey())
    .addColumn('provider', 'text', column => column.notNull())
    .addColumn('name', 'text', column => column.notNull())
    .addColumn('position', 'integer', column => column.notNull())
    .addColumn('data', 'jsonb', column => column.notNull())
    .execute();
  await db.schema.createTable('machines')
    .addColumn('id', 'uuid', column => column.primaryKey())
    .addColumn('farm_id', 'uuid', column => column.notNull().references('farms.id').onDelete('restrict'))
    .addColumn('name', 'text', column => column.notNull())
    .addColumn('position', 'integer', column => column.notNull())
    // Un compte cloud utilisé par une machine ne peut pas être supprimé (même règle que `cloud-in-use`).
    .addColumn('cloud_account_id', 'uuid', column => column.references('cloud_accounts.id').onDelete('restrict'))
    .addColumn('manual_spool', 'jsonb')
    .execute();
  // Connexion d'une machine : type de connecteur, adresse, série et réglages propres (codes d'accès compris).
  await db.schema.createTable('machine_connections')
    .addColumn('machine_id', 'uuid', column => column.primaryKey().references('machines.id').onDelete('cascade'))
    .addColumn('kind', 'text')
    .addColumn('origin', 'text', column => column.notNull())
    .addColumn('serial', 'text')
    .addColumn('settings', 'jsonb', column => column.notNull())
    .execute();
  // Mêmes règles que `machine-duplicate` : une adresse LAN par machine (les machines cloud partagent le broker),
  // une série par type ; `bambu` et `bambu-cloud` partagent leurs séries (`cloud-machine-exists`).
  await sql`create unique index machine_connections_origin on machine_connections (origin) where kind is distinct from 'bambu-cloud'`.execute(db);
  await sql`create unique index machine_connections_serial on machine_connections ((case when kind in ('bambu', 'bambu-cloud') then 'bambu' else coalesce(kind, 'klipper') end), serial) where serial is not null`.execute(db);
  // Préférences d'installation (notifications…), une valeur JSON par clé.
  await db.schema.createTable('settings')
    .addColumn('key', 'text', column => column.primaryKey())
    .addColumn('value', 'jsonb', column => column.notNull())
    .execute();
}

export async function down(db: AnyDb): Promise<void> {
  for (const table of ['settings', 'machine_connections', 'machines', 'cloud_accounts', 'users', 'farms', 'sites', 'organizations', 'installation']) {
    await db.schema.dropTable(table).execute();
  }
}
