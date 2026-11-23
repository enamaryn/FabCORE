import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import { I18nextProvider } from 'react-i18next';
import { createServer } from 'vite';
import { authorizationLost, canCopy, canLaunch, connectionSignature, runFileBatch, safetySignature, transferCandidates } from '../src/file-batch.ts';

const machine = (id, changes = {}) => ({ id, name: id, kind: 'klipper', status: 'ready', cameraOpen: false, capabilities: { files: true, printJob: true, fileFamily: 'fdm' }, ...changes });
const source = machine('source');

test('Candidates require storage, same family and explicit project support for .3mf', () => {
  const candidates = [source, machine('plain'), machine('project', { capabilities: { files: true, projects: true } }), machine('laser', { capabilities: { files: true, fileFamily: 'laser', projects: true } }), machine('none', { capabilities: { files: false } })];
  assert.deepEqual(transferCandidates(source, 'folder/model.gcode', candidates).map(m => m.id), ['plain', 'project']);
  assert.deepEqual(transferCandidates(source, 'folder/model.3MF', candidates).map(m => m.id), ['project']);
  assert.deepEqual(transferCandidates(candidates[3], 'job.gcode', candidates).map(m => m.id), []);
});
test('Copy and launch gates read current roles, capabilities and states', () => {
  const target = machine('target');
  assert.equal(canCopy(source, target, 'a.gcode', 'admin'), true);
  for (const role of ['observer', '']) assert.equal(canCopy(source, target, 'a.gcode', role), false);
  for (const status of ['offline', 'connecting']) {
    assert.equal(canCopy({ ...source, status }, target, 'a.gcode', 'admin'), false);
    assert.equal(canCopy(source, { ...target, status }, 'a.gcode', 'admin'), false);
  }
  for (const status of ['printing', 'paused', 'offline', 'connecting', 'error']) assert.equal(canLaunch({ ...target, status }, 'admin'), false);
  assert.equal(canLaunch({ ...target, status: 'done' }, 'admin'), true);
  assert.equal(canLaunch(target, 'observer'), false);
  assert.equal(canLaunch(undefined, 'admin'), false);
  assert.equal(canLaunch({ ...target, capabilities: { files: true, printJob: false } }, 'admin'), false);
});
test('Copies run with concurrency one, keep exact returned paths and do not hide individual failures', async () => {
  let active = 0, peak = 0;
  const order = [], updates = [];
  const results = await runFileBatch(['a', 'b', 'c'], async id => {
    active++; peak = Math.max(peak, active); order.push(id);
    await Promise.resolve(); active--;
    if (id === 'b') throw { code: 'file-exists' };
    return { destination: id, path: `native/${id}/actual-name.gcode` };
  }, { signal: new AbortController().signal, changed: result => updates.push(result) });
  assert.equal(peak, 1); assert.deepEqual(order, ['a', 'b', 'c']); assert.deepEqual(results.map(result => result.ok), [true, false, true]);
  assert.equal(updates.length, 3);
  assert.deepEqual(results.filter(result => result.ok).map(result => result.value.path), ['native/a/actual-name.gcode', 'native/c/actual-name.gcode']);
});
test('Unknown outcome is attempted once and never replayed; later destinations still run', async () => {
  const calls = [];
  const results = await runFileBatch(['a', 'b'], async id => { calls.push(id); if (id === 'a') throw { code: 'command-unconfirmed' }; return { status: 'printing' }; }, { signal: new AbortController().signal });
  assert.deepEqual(calls, ['a', 'b']); assert.equal(results[0].ok, false); assert.equal(results[1].ok, true);
});
test('Cancellation/unmount stops NEXT operation, even when the active request ignores abort', async () => {
  const controller = new AbortController(), calls = [], updates = [];
  let release;
  const pending = runFileBatch(['a', 'b'], async id => { calls.push(id); await new Promise(resolve => { release = resolve; }); return id; }, { signal: controller.signal, changed: result => updates.push(result) });
  controller.abort(); release(); await pending;
  assert.deepEqual(calls, ['a']); assert.deepEqual(updates, []);
  const before = await runFileBatch(['c'], async id => { calls.push(id); }, { signal: controller.signal });
  assert.deepEqual(before, []); assert.deepEqual(calls, ['a']);
});
test('A role or state update between operations prevents the next API call', async () => {
  for (const change of ['observer', 'printing', 'offline']) {
    let role = 'admin', target = machine('b'); const calls = [];
    const results = await runFileBatch(['a', 'b'], async id => {
      if (!canLaunch(id === 'b' ? target : machine(id), role)) throw { code: 'unavailable' };
      calls.push(id);
      if (change === 'observer') role = 'observer'; else target = { ...target, status: change };
      return { status: 'printing' };
    }, { signal: new AbortController().signal });
    assert.deepEqual(calls, ['a']); assert.equal(results[1].ok, false);
  }
});

const resources = Object.fromEntries(['fr', 'en'].map(lang => [lang, { transfers: JSON.parse(readFileSync(new URL(`../locales/${lang}/transfers.json`, import.meta.url), 'utf8')) }]));
const i18n = createInstance(); await i18n.use(ICU).init({ resources, lng: 'fr', defaultNS: 'transfers', interpolation: { escapeValue: false } });
const server = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
after(() => server.close());
const { TransferDialog } = await server.ssrLoadModule('/src/components/files/TransferDialog.tsx');
test('Dialog renders React markup with accessible names, explicit copy action and separate namespace', () => {
  const props = { source, path: 'folder/<part>.gcode', machines: [source, machine('target')], role: 'admin', api: { transfer() { throw new Error('render must not copy'); }, print() { throw new Error('render must not start'); } }, close() {}, changed() {} };
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(TransferDialog, props)));
  assert.match(html, /<dialog[^>]+aria-labelledby/); assert.match(html, /Transférer vers la sélection/); assert.match(html, /folder\/&lt;part&gt;.gcode/); assert.doesNotMatch(html, /Lancer la sélection/);
  const observer = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(TransferDialog, { ...props, role: 'observer' })));
  assert.match(observer, /fieldset[^>]+disabled/); assert.match(observer, /type="submit"[^>]+disabled/);
});
test('French and English catalogs cover identical keys and render safety confirmations', async () => {
  const keys = value => Object.entries(value).flatMap(([key, item]) => typeof item === 'object' ? keys(item).map(sub => `${key}.${sub}`) : [key]).sort();
  assert.deepEqual(keys(resources.fr.transfers), keys(resources.en.transfers));
  for (const lang of ['fr', 'en']) {
    await i18n.changeLanguage(lang);
    for (const key of keys(resources[lang].transfers)) { const rendered = i18n.t(key); assert.notEqual(rendered, key); assert.doesNotMatch(rendered, /\{[^}]+\}/); }
    assert.ok(i18n.t('laserConfirm').length > 40); assert.match(i18n.t('externalConfirm'), /AMS\/CANVAS/);
  }
});

test('Ray5 copies require ready/done on BOTH source and destination; ESP3D cannot start', () => {
  const ray = id => machine(id, { kind: 'longer-ray5', capabilities: { files: true, fileFamily: 'laser' } });
  for (const status of ['printing', 'paused', 'offline', 'connecting', 'error']) {
    assert.equal(canCopy({ ...ray('source'), status }, ray('target'), 'a.nc', 'admin'), false);
    assert.equal(canCopy(ray('source'), { ...ray('target'), status }, 'a.nc', 'admin'), false);
  }
  assert.equal(canCopy({ ...ray('source'), status: 'done' }, ray('target'), 'a.nc', 'admin'), true);
  assert.equal(canLaunch(machine('esp', { transport: 'esp3d' }), 'admin'), false);
});
test('Cancellation in a started callback also prevents that API request', async () => {
  const controller = new AbortController(); let calls = 0;
  await runFileBatch(['a'], async () => { calls++; }, { signal: controller.signal, started() { controller.abort(); } });
  assert.equal(calls, 0);
});


test('Approved connection and safety signatures reject edited same-id connections and changed confirmations', () => {
  const target = machine('target', { origin: 'http://machine-one', transport: 'sdcp', serial: 'old' });
  const approved = safetySignature(target), connection = connectionSignature(target);
  for (const change of [{ origin: 'http://machine-two' }, { transport: 'esp3d' }, { serial: 'new' }, { kind: 'other' }]) {
    assert.notEqual(connectionSignature({ ...target, ...change }), connection);
    assert.notEqual(safetySignature({ ...target, ...change }), approved);
  }
  assert.notEqual(safetySignature({ ...target, capabilities: { ...target.capabilities, externalFilament: true } }), approved);
  assert.notEqual(safetySignature({ ...target, capabilities: { ...target.capabilities, fileFamily: 'laser' } }), approved);
  assert.equal(safetySignature({ ...target, status: 'done', name: 'Renamed' }), approved, 'telemetry and display names do not replace the connection');
});


test('Session or permission failure immediately stops the queue and preserves attempted and skipped results', async () => {
  for (const code of ['sign-in', 'forbidden']) {
    const calls = [], changed = [], skipped = [];
    const results = await runFileBatch(['first', 'denied', 'next', 'last'], async id => {
      calls.push(id); if (id === 'denied') throw { code }; return { path: `actual/${id}.gcode` };
    }, { signal: new AbortController().signal, stopOnError: authorizationLost, changed: result => changed.push(result), skipped: id => skipped.push(id) });
    assert.deepEqual(calls, ['first', 'denied']);
    assert.deepEqual(results, changed); assert.equal(results.length, 2);
    assert.equal(results[0].value.path, 'actual/first.gcode'); assert.equal(results[1].error.code, code);
    assert.deepEqual(skipped, ['next', 'last']);
  }
});
test('Machine-specific authorization and unknown command outcomes do not stop other destinations', async () => {
  for (const code of ['bambu-authorization', 'command-unconfirmed']) {
    const calls = [], skipped = [];
    const results = await runFileBatch(['first', 'next'], async id => { calls.push(id); if (id === 'first') throw { code }; return id; }, { signal: new AbortController().signal, stopOnError: authorizationLost, skipped: id => skipped.push(id) });
    assert.deepEqual(calls, ['first', 'next']); assert.deepEqual(skipped, []); assert.deepEqual(results.map(result => result.ok), [false, true]);
  }
});
