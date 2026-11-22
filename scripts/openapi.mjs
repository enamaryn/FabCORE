#!/usr/bin/env node
// Écrit (ou vérifie avec --check) docs/api/openapi.json à partir des schémas des routes migrées.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openApiDocument } from '../src/http/openapi.ts';

const target = new URL('../docs/api/openapi.json', import.meta.url);
const expected = JSON.stringify(await openApiDocument(), null, 2) + '\n';
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(target, 'utf8'); } catch { /* absent */ }
  if (current !== expected) { console.error('docs/api/openapi.json n’est pas à jour : lancer npm run openapi.'); process.exit(1); }
  console.log('OK : docs/api/openapi.json à jour.');
} else {
  mkdirSync(new URL('.', target), { recursive: true });
  writeFileSync(target, expected);
  console.log('docs/api/openapi.json écrit.');
}
