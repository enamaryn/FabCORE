#!/usr/bin/env node
// Vérifie que toutes les dépendances installées par le verrou ont une licence compatible GPL-3.0 (ADR 0002).
// Lit package-lock.json : aucune dépendance supplémentaire, aucun accès réseau.
import { readFileSync } from 'node:fs';

const allowed = new Set(['MIT', 'MIT-0', 'ISC', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'BlueOak-1.0.0', 'Python-2.0', 'CC0-1.0', 'Unlicense', 'LGPL-3.0-or-later', 'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later']);
const accepts = expr => expr.replace(/[()]/g, '').split(/\s+OR\s+/).some(alt => alt.split(/\s+AND\s+/).every(id => allowed.has(id.trim())));

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const refused = [];
let count = 0;
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (!path || entry.link) continue;
  count += 1;
  const license = typeof entry.license === 'string' ? entry.license : '';
  if (!license || !accepts(license)) refused.push(`${path.split('node_modules/').pop()}@${entry.version}: ${license || 'licence absente'}`);
}
if (refused.length) {
  console.error(`Licences refusées ou inconnues (${refused.length}) :\n${refused.map(line => `- ${line}`).join('\n')}`);
  process.exit(1);
}
console.log(`OK : ${count} paquets, licences compatibles GPL-3.0.`);
