#!/usr/bin/env node
// Traduit FABCORE_DATABASE_URL en variables libpq pour pg_dump/pg_restore/psql, sans exposer l'URL dans la
// liste des processus. Sortie : lignes `export NOM=valeur` déjà échappées pour bash, lues par `eval`.
// Ajoute FABCORE_PG_SCHEMA (schéma courant de FabCore) et vérifie la connexion.
import pg from 'pg';

const url = process.env.FABCORE_DATABASE_URL;
if (!url) { console.error('FABCORE_DATABASE_URL absent.'); process.exit(1); }
let parsed;
try { parsed = new URL(url); } catch { console.error('FABCORE_DATABASE_URL invalide.'); process.exit(1); }
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
  const { rows } = await client.query('select current_schema() as schema, current_database() as database, current_setting(\'server_version_num\') as version');
  // Restauration : refusée tant qu'une instance FabCore tient le verrou de cette base (même clé que le magasin).
  if (process.argv.includes('--require-stopped')) {
    const lock = await client.query("select pg_try_advisory_lock(hashtext('fabcore:' || current_database() || '.' || current_schema())) as locked");
    if (!lock.rows[0].locked) { console.error('FabCore utilise encore cette base : l’arrêter avant de restaurer.'); process.exit(3); }
  }
  const env = {
    PGHOST: decodeURIComponent(parsed.hostname.replace(/^\[|\]$/g, '')) || 'localhost',
    PGPORT: parsed.port || '5432',
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: rows[0].database,
    PGSSLMODE: parsed.searchParams.get('sslmode') ?? '',
    PGSSLROOTCERT: parsed.searchParams.get('sslrootcert') ?? '',
    PGOPTIONS: parsed.searchParams.get('options') ?? '',
    FABCORE_PG_SCHEMA: rows[0].schema,
    FABCORE_PG_MAJOR: String(Math.floor(Number(rows[0].version) / 10000)),
  };
  for (const [name, value] of Object.entries(env)) if (value !== '') console.log(`export ${name}=${quote(value)}`);
} catch (error) {
  console.error(`PostgreSQL injoignable : ${String(error.message).split('\n')[0]}`);
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
