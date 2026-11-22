// Navigation locale : aucune dépendance, aucun réseau, aucune exécution du produit.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const topics = JSON.parse(readFileSync(resolve(root, 'docs/ai/topics.json'), 'utf8'));
const [action = '--help'] = process.argv.slice(2);
function validate() {
  const errors = [], seen = new Set();
  for (const topic of topics) {
    if (seen.has(topic.id)) errors.push(`Sujet dupliqué : ${topic.id}`);
    seen.add(topic.id);
    for (const path of [...topic.files, ...topic.tests, ...topic.docs]) {
      const full = resolve(root, path);
      if (relative(root, full).startsWith('..') || !existsSync(full)) errors.push(`Chemin invalide : ${path}`);
    }
    const sources = topic.files.filter(p => existsSync(resolve(root, p))).map(p => readFileSync(resolve(root, p), 'utf8'));
    for (const symbol of topic.symbols) {
      // Vérification lexicale d'une déclaration, pas résolution sémantique des appels.
      const re = new RegExp('(?:function |class |const |let |var )' + symbol + '[( =]');
      if (!sources.some(source => re.test(source))) errors.push(`Symbole à mettre à jour : ${topic.id}/${symbol}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
}
function render() {
  const lines = ['# Carte du code FabCore', '',
    'Carte de navigation générée depuis `topics.json`. Lire la ligne du sujet, puis le symbole et son test. Ne pas charger tous les fichiers listés. Les chemins décrivent le POC actuel, pas la future architecture MVP.', '',
    'Exécuter `node scripts/ai-context.mjs <sujet>` pour obtenir les références avec numéros de ligne actuels et empreintes SHA-256. `--check` détecte les chemins/symboles disparus et une carte non régénérée ; il ne certifie pas les relations fonctionnelles.', '',
    '| Sujet | Sources principales | Symboles | Tests de départ |', '| --- | --- | --- | --- |'];
  for (const t of topics) lines.push(`| \`${t.id}\` · ${t.title} | ${t.files.map(p => `[${p}](../../${p})`).join(', ')} | ${t.symbols.map(s => `\`${s}\``).join(', ')} | ${t.tests.map(p => `[${p}](../../${p})`).join(', ')} |`);
  lines.push('', 'Sources et limites fabricant : lancer la recherche par sujet. Mise à jour : `node scripts/ai-context.mjs --write-map`, puis `--check`. Les numéros de ligne ne sont volontairement pas figés ici.', '');
  return lines.join('\n');
}
try {
  if (action === '--help') console.log('Usage : node scripts/ai-context.mjs <sujet|--list|--check|--write-map>');
  else if (action === '--list') console.log(topics.map(t => `${t.id}: ${t.title}`).join('\n'));
  else {
    validate();
    if (action === '--write-map') writeFileSync(resolve(root, 'docs/ai/CODEMAP.md'), render());
    else if (action === '--check') {
      if (readFileSync(resolve(root, 'docs/ai/CODEMAP.md'), 'utf8') !== render()) throw new Error('Carte à régénérer avec --write-map');
      console.log(`OK : ${topics.length} sujets, chemins et déclarations vérifiés ; carte à jour.`);
    } else {
      const topic = topics.find(t => t.id === action);
      if (!topic) throw new Error('Sujet inconnu ; utiliser --list.');
      let commit = 'non disponible';
      try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
      console.log(`${topic.title}\nHEAD ${commit} — les empreintes ci-dessous décrivent les fichiers de travail.`);
      for (const p of topic.files) {
        const source = readFileSync(resolve(root, p), 'utf8');
        console.log(`${p} sha256:${createHash('sha256').update(source).digest('hex')}`);
        for (const [i, line] of source.split('\n').entries()) {
          if (topic.symbols.some(s => ['function ', 'class ', 'const ', 'let ', 'var '].some(prefix => line.includes(prefix + s))) ) console.log(`  ${i + 1}: ${line.trim().slice(0, 200)}`);
        }
      }
      console.log(`Tests : ${topic.tests.join(' ')}\nDocumentation : ${topic.docs.join(' ')}`);
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
