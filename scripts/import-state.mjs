#!/usr/bin/env node
// MIG-04.2 · import de state.json dans PostgreSQL.
//   FABCORE_DATABASE_URL=postgres://… node scripts/import-state.mjs [--data .fabcore] [--apply]
// Sans --apply : simulation complète (écriture, contraintes et relecture) puis annulation. Rapport JSON sans secret.
// Code de sortie : 0 importé, simulé ou déjà importé ; 2 bloqué ; 1 erreur.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { openDatabase } from '../src/persistence/database.ts';
import { importState, readCloudKey } from '../src/persistence/import.ts';

const { values } = parseArgs({ options: { data: { type: 'string' }, apply: { type: 'boolean', default: false } } });
const url = process.env.FABCORE_DATABASE_URL;
if (!url) { console.error('FABCORE_DATABASE_URL requis (jamais en argument : il apparaîtrait dans la liste des processus).'); process.exit(1); }
const directory = resolve(values.data ?? process.env.FABCORE_DATA ?? '.fabcore');
let raw;
try { raw = JSON.parse(readFileSync(join(directory, 'state.json'), 'utf8')); }
catch (error) { console.error(`state.json illisible dans ${directory} : ${error.code ?? 'JSON invalide'}`); process.exit(1); }
const { db } = openDatabase(url, { max: 2 });
try {
  const report = await importState(db, raw, { apply: values.apply, cloudKey: readCloudKey(directory) });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === 'blocked' ? 2 : 0;
} catch (error) {
  console.error(`Import interrompu : ${String(error.message).split('\n')[0]}`);
  process.exitCode = 1;
} finally { await db.destroy(); }
