import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { connectorCatalog } from './connectors.mjs';

const source = readFileSync(new URL('./live.js', import.meta.url), 'utf8');
const batch = source.slice(source.indexOf('async function runFileBatch('), source.indexOf('function fileBatchStyles('));
const popup = source.slice(source.indexOf('function openTransferredPrint('), source.indexOf('async function startPrint('));

function harness({ all = false, failFirst = false } = {}) {
  const handlers = {}, elements = new Map(), requests = [], phases = [];
  const form = { dataset: {}, addEventListener: (name, handler) => { handlers[name] = handler; }, querySelectorAll: () => [],
    querySelector: selector => { if (!elements.has(selector)) elements.set(selector, {}); return elements.get(selector); } };
  const dialog = { innerHTML: '', querySelector: () => form };
  const machines = [{ id: 'one', name: 'P2S', kind: 'bambu', status: 'ready' }, { id: 'two', name: 'Prusa', kind: 'prusalink', status: 'ready' },
    { id: 'busy', name: 'Occupée', kind: 'klipper', status: 'printing' }, { id: 'failed', name: 'Échec', kind: 'klipper', status: 'ready' }];
  const sandbox = { dialog, machineConnectors: connectorCatalog, t: fr => fr, esc: String, btn: (_action, label) => label,
    machine: id => machines.find(m => m.id === id), canStart: m => m.status === 'ready', fileBatchStyles: () => '', fileBatchRows: () => '',
    updateFileBatch: (_list, item, phase) => phases.push([item.id, phase]), refresh: () => {}, problem: code => code,
    FormData: class { getAll() { return ['two', 'failed', 'busy']; } get() { return 'on'; } },
    api: async (path, data) => { requests.push({ path, data }); if (failFirst && path.includes('/one/')) throw { code: 'command-unconfirmed' }; return {}; } };
  runInNewContext(batch + popup + '\nthis.open=openTransferredPrint;', sandbox);
  sandbox.open(machines.map(m => ({ item: m, ok: m.id !== 'failed', value: { path: 'usb/' + m.id + '.gcode' }, error: { code: 'upload-failed' } })));
  return { requests, phases, dialog, submit: () => handlers.submit({ preventDefault() {}, submitter: { value: all ? 'all' : 'selected' } }) };
}

test('après transfert : aucune impression automatique, lancement limité à la sélection réussie et disponible', async () => {
  const ui = harness();
  assert.equal(ui.requests.length, 0);
  assert.match(ui.dialog.innerHTML, /name="print" value="one"/);
  assert.match(ui.dialog.innerHTML, /name="print" value="two"/);
  assert.doesNotMatch(ui.dialog.innerHTML, /name="print" value="(?:busy|failed)"/);
  await ui.submit();
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].path, 'machines/two/print');
  assert.equal(ui.requests[0].data.path, 'usb/two.gcode', 'chemin retourné par le stockage réel');
  assert.equal(ui.requests[0].data.confirm, true);
  await ui.submit(); assert.equal(ui.requests.length, 1, 'pas de double lancement');
});

test('Tout lancer : chaque copie réussie disponible est tentée une fois, résultat inconnu non renvoyé', async () => {
  const ui = harness({ all: true, failFirst: true });
  await ui.submit();
  assert.deepEqual(ui.requests.map(r => r.path), ['machines/one/print', 'machines/two/print']);
  assert.equal(ui.requests[0].data.filamentMode, 'external');
  assert.deepEqual(ui.phases, [['one', 'running'], ['one', 'error'], ['two', 'running'], ['two', 'success']]);
});
