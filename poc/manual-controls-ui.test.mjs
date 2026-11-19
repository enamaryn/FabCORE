import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { connectorCatalog } from './connectors.mjs';

test('panneau contrôles : lecture observateur, actions administrateur et capacités réelles', () => {
  const source = readFileSync(new URL('./live.js', import.meta.url), 'utf8');
  const start = source.indexOf('const manualStates =');
  const end = source.indexOf("app.addEventListener('submit', event => {", start);
  const sandbox = { machineConnectors: connectorCatalog, state: { role: 'admin', lang: 'fr' }, t: fr => fr, esc: String,
    btn: (action, label, _icon, _class, extra) => `<button data-action="${action}" ${extra}>${label}</button>` };
  runInNewContext(source.slice(start, end) + '\nthis.panel=manualControlsPanel;this.entry=manualState;', sandbox);
  const machine = { id: 'one', kind: 'bambu', status: 'ready' };
  sandbox.entry(machine.id).data = { status: 'ready', lights: [{ id: 'chamber_light', value: true, writable: true }], heaters: [{ id: 'nozzle', current: 25, target: 0, max: 260, writable: true }], fans: [{ id: 'part', percent: 40, rpm: null, writable: true }], motion: null };
  let html = sandbox.panel(machine);
  assert.match(html, /manual-light:0:off/); assert.match(html, /data-manual-form="heat"/); assert.match(html, /data-manual-form="fan"/);
  assert.doesNotMatch(html, /manual-home/);
  sandbox.state.role = 'viewer'; html = sandbox.panel(machine);
  assert.match(html, /25 °C/); assert.match(html, /40 %/);
  assert.doesNotMatch(html, /manual-light:|data-manual-form=|manual-home/);
  assert.equal(sandbox.panel({ kind: 'xtool-m2' }), '');
  sandbox.state.role = 'admin';
  html = sandbox.panel({ ...machine, status: 'offline' });
  assert.match(html, /data-action="manual-light:0:off" disabled/);
});
