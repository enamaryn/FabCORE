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
