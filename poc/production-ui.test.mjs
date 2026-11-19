import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { connectorCatalog } from './connectors.mjs';

test('fiche machine : contrôles par capacité, observateur et aperçu local sans lancement', () => {
  const source = readFileSync(new URL('./live.js', import.meta.url), 'utf8');
  const fabrication = source.slice(source.indexOf('function liveFabrication('), source.indexOf('const temperatureHistory'));
  const files = source.slice(source.indexOf('const machineFiles ='), source.indexOf('function renderFiles('));
  const sandbox = { machineConnectors: connectorCatalog, state: { role: 'admin', lang: 'fr' }, pendingPrintCommands: new Set(),
    t: (fr) => fr, esc: String, badge: () => '', btn: action => `<button data-action="${action}"></button>` };
  runInNewContext(fabrication + '\n' + files + '\nthis.fabrication=liveFabrication;this.files=filesPanel;', sandbox);
  const machine = { id: 'one', kind: 'elegoo', status: 'paused', progress: 0 };
  let html = sandbox.fabrication(machine);
  assert.match(html, /print-command:stop/); assert.doesNotMatch(html, /print-command:resume/);
  html = sandbox.fabrication({ ...machine, kind: 'bambu' });
  assert.match(html, /print-command:resume/); assert.match(html, /print-command:stop/);
  html = sandbox.fabrication({ ...machine, kind: 'klipper', status: 'ready' });
  assert.match(html, /files-focus/);
  sandbox.state.role = 'viewer';
  html = sandbox.fabrication({ ...machine, kind: 'bambu', status: 'printing' });
  assert.doesNotMatch(html, /print-command:/);
  html = sandbox.files(machine);
  assert.match(html, /data-gcode-local/); assert.doesNotMatch(html, /data-files-upload/);
  html = sandbox.files({ ...machine, kind: 'xtool-m2' });
  assert.match(html, /data-gcode-local/); assert.doesNotMatch(html, /data-files-upload/);
});


test('fichiers : filtrer et paginer conserve la cible exacte des actions', () => {
  const source = readFileSync(new URL('./live.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('const machineFiles ='), source.indexOf('function renderFiles('));
  const sandbox = { machineConnectors: connectorCatalog, state: { role: 'admin', lang: 'fr' },
    t: fr => fr, esc: String, btn: action => `<button data-action="${action}"></button>` };
  runInNewContext(code + '\nthis.filesState=filesState;this.filesPanel=filesPanel;this.filePage=filePage;', sandbox);
  const machine = { id: 'bambu', kind: 'bambu', status: 'ready' };
  const entry = sandbox.filesState(machine.id);
  entry.files = Array.from({ length: 24 }, (_, index) => ({ path: `piece-${24 - index}.gcode`, size: 12, modified: index === 0 ? null : index * 1000 }));
  let html = sandbox.filesPanel(machine);
  assert.equal((html.match(/data-action="files-print:/g) ?? []).length, 5);
  assert.match(html, /files-print:23/);
  assert.equal(sandbox.filePage(entry).rows[0].file.path, entry.files[23].path);
  entry.sort = 'name'; entry.query = 'PIECE-2'; entry.page = 0;
  let page = sandbox.filePage(entry);
  assert.deepEqual(Array.from(page.rows, row => row.file.path), ['piece-2.gcode', 'piece-20.gcode', 'piece-21.gcode', 'piece-22.gcode', 'piece-23.gcode']);
  html = sandbox.filesPanel(machine);
  for (const { file, index } of page.rows) {
    assert.equal(entry.files[index].path, file.path);
    assert.match(html, new RegExp('files-print:' + index + '"'));
    assert.match(html, new RegExp('viewer-open:' + index + '"'));
  }
  entry.page = 1;
  page = sandbox.filePage(entry);
  assert.equal(page.rows[0].file.path, 'piece-24.gcode');
  entry.query = 'no-match';
  html = sandbox.filesPanel(machine);
  assert.equal(entry.page, 0); assert.match(html, /Aucun fichier ne correspond/); assert.doesNotMatch(html, /files-print:/);
  entry.query = ''; entry.pageSize = 20; entry.page = 0;
  assert.equal((sandbox.filesPanel(machine).match(/data-action="files-print:/g) ?? []).length, 20);
  entry.page = 1;
  assert.equal(sandbox.filePage(entry).rows.length, 4);
  entry.files = entry.files.slice(0, 2);
  sandbox.filesPanel(machine); assert.equal(entry.page, 0, 'recalage après actualisation');
  entry.sort = 'oldest';
  assert.equal(sandbox.filePage(entry).rows.at(-1).file.modified, null, 'dates inconnues toujours en dernier');
  assert.equal(sandbox.filesState('other').query, '', 'recherche indépendante par machine');
  const cc2 = sandbox.filesState('cc2'); cc2.files = [];
  html = sandbox.filesPanel({ id: 'cc2', kind: 'elegoo', status: 'ready' });
  assert.match(html, /Aucun fichier envoyé via FabCore/);
  assert.doesNotMatch(html, /Aucun fichier G-code sur la machine/);
});
