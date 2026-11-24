// Régressions de l'interface historique : un champ nommé « id » masque form.id (formulaire « Modifier la machine »
// envoyé en GET natif), et une fonction globale « history » du prototype masquait window.history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const live = readFileSync(new URL('./live.js', import.meta.url), 'utf8');
const cloud = readFileSync(new URL('./cloud.js', import.meta.url), 'utf8');
const prototype = readFileSync(new URL('../design/prototype.html', import.meta.url), 'utf8');

test('formulaires : identifiés par leur attribut id, jamais par form.id', () => {
  for (const [name, source] of [['live.js', live], ['cloud.js', cloud]]) assert.doesNotMatch(source, /\bform\??\.id\b/, name);
  const line = live.split('\n').find(text => text.startsWith('const formId ='));
  assert.ok(line);
  const sandbox = {};
  runInNewContext(line + '\nthis.formId = formId;', sandbox);
  // Formulaire de modification : form.id renvoie le champ caché <input name="id">, pas « add-machine ».
  const edit = { id: { name: 'id', value: 'cedd2bb4' }, getAttribute: attribute => attribute === 'id' ? 'add-machine' : null };
  assert.equal(sandbox.formId(edit), 'add-machine');
  assert.equal(sandbox.formId(null), '');
  assert.equal(sandbox.formId(undefined), '');
});

test('prototype partagé : aucune déclaration globale ne masque window.history', () => {
  const script = prototype.match(/<script>([\s\S]+)<\/script>/)[1];
  assert.doesNotMatch(script, /^\s*(?:function|let|const|var|class)\s+history\b/m);
  assert.doesNotMatch(script, /[,{]\s*history\s*:\s*history\b/);
});
