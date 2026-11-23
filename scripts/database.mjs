#!/usr/bin/env node
// Outils PostgreSQL de la commande `fabcore` ; configuration lue comme le serveur (src/config/database.ts).
//   check  Vérifie joignabilité, TLS, version ≥ 16, droits de création et état FabCore de la base.
//   env    Variables libpq pour pg_dump/pg_restore (lignes `export NOM=valeur` lues par `eval`), sans exposer
//          l'URL dans la liste des processus ; --require-stopped refuse si une instance tient la base.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { ConfigError, loadDatabaseConfig, pgSsl } from '../src/config/database.ts';

const [command, ...options] = process.argv.slice(2);
let config;
try { config = loadDatabaseConfig(process.env); }
catch (error) {
  console.error(error instanceof ConfigError ? `Configuration invalide (${error.message}) : vérifier ${error.variable}.` : 'Configuration illisible.');
  process.exit(1);
}
if (!config) { console.error('Aucune base configurée : définir FABCORE_DATABASE_URL (environnement ou fichier FABCORE_CONFIG).'); process.exit(1); }
const ssl = pgSsl(config);
const client = new pg.Client({ connectionString: config.url, connectionTimeoutMillis: config.connectTimeoutMs, ...(ssl === undefined ? {} : { ssl }) });
const first = message => String(message).split('\n')[0];

async function check() {
  const results = [];
  const report = (ok, label, detail = '') => { results.push(ok); console.log(`${ok === null ? '·' : ok ? '✓' : '✗'} ${label}${detail ? ' : ' + detail : ''}`); };
  try { await client.connect(); report(true, 'Connexion'); }
  catch (error) { report(false, 'Connexion', first(error.message)); return false; }
  const { rows: [info] } = await client.query(`select current_setting('server_version_num')::int as version, current_setting('server_version') as label,
    current_database() as database, current_schema() as schema,
    coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as tls`);
  const local = ['localhost', '127.0.0.1', '::1', '[::1]', ''].includes(new URL(config.url).hostname);
  report(info.tls ? true : local ? null : false, 'Chiffrement TLS', info.tls ? (config.ssl === 'verify-full' ? 'actif, certificat vérifié' : 'actif') : local ? 'inactif (connexion locale)' : 'inactif sur une connexion réseau : définir FABCORE_DATABASE_SSL=verify-full');
  report(info.version >= 160000, 'Version', `PostgreSQL ${info.label}${info.version >= 160000 ? '' : ' (16 minimum)'}`);
  // Droits réels vérifiés par des créations annulées. FabCore crée ses tables dans le schéma courant (requis) ;
  // la création de schéma n'est utile que pour isoler plusieurs installations (information).
  const probe = 'fabcore_check_' + randomBytes(4).toString('hex');
  const attempt = async sql => {
    try { await client.query('begin'); await client.query(sql); return null; }
    catch (error) { return first(error.message); }
    finally { await client.query('rollback').catch(() => {}); }
  };
  if (!info.schema) report(false, 'Création de tables', 'aucun schéma courant (search_path)');
  else {
    const table = await attempt(`create table "${info.schema.replaceAll('"', '""')}".${probe} (id int)`);
    report(!table, 'Création de tables', table ?? `autorisée dans « ${info.schema} »`);
  }
  const schema = await attempt(`create schema ${probe}`);
  report(null, 'Création de schémas', schema ? `refusée (${schema}) : sans incidence si FabCore a son schéma` : 'autorisée');
  const installed = await client.query(`select source from installation where id = 1`).then(result => result.rows[0]?.source, () => null);
  report(null, 'Données FabCore', installed ? `installation présente (${installed === 'state.json' ? 'importée de state.json' : 'nouvelle'})` : 'base vide : fabcore import (state.json existant) ou premier démarrage');
  return results.every(ok => ok !== false);
}

async function env() {
  await client.connect();
  const { rows: [info] } = await client.query("select current_schema() as schema, current_database() as database, current_setting('server_version_num') as version");
  if (options.includes('--require-stopped')) {
    const lock = await client.query("select pg_try_advisory_lock(hashtext('fabcore:' || current_database() || '.' || current_schema())) as locked");
    if (!lock.rows[0].locked) { console.error('FabCore utilise encore cette base : l’arrêter avant de restaurer.'); process.exit(3); }
  }
  const url = new URL(config.url);
  const sslmode = config.ssl ?? url.searchParams.get('sslmode') ?? '';
  const values = {
    PGHOST: decodeURIComponent(url.hostname.replace(/^\[|\]$/g, '')) || 'localhost', PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: info.database,
    PGSSLMODE: sslmode, PGSSLROOTCERT: config.caFile ?? url.searchParams.get('sslrootcert') ?? '',
    PGOPTIONS: url.searchParams.get('options') ?? '', PGCONNECT_TIMEOUT: String(Math.ceil(config.connectTimeoutMs / 1000)),
    FABCORE_PG_SCHEMA: info.schema, FABCORE_PG_MAJOR: String(Math.floor(Number(info.version) / 10000)),
  };
  const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
  for (const [name, value] of Object.entries(values)) if (value !== '') console.log(`export ${name}=${quote(value)}`);
}

try {
  if (command === 'check') process.exitCode = await check() ? 0 : 1;
  else if (command === 'env') await env();
  else { console.error('Usage : database.mjs check | env [--require-stopped]'); process.exitCode = 2; }
} catch (error) {
  console.error(`PostgreSQL injoignable : ${first(error.message)}`);
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
