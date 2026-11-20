import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { connectorCatalog } from './connectors.mjs';
const source = readFileSync(new URL('./live.js', import.meta.url), 'utf8');

test('cockpit : onglets isolés et mémorisés par machine, console limitée aux capacités', () => {
  const machines = [{ id: 'one', kind: 'bambu', name: 'P2S', model: 'Bambu Lab', status: 'ready' }, { id: 'two', kind: 'klipper', name: 'Ender', model: 'Klipper', status: 'ready' }];
  let renders = 0;
  const sandbox = { state: { machine: 'one', role: 'admin' }, machine: id => machines.find(m => m.id === id), machineConnectors: connectorCatalog,
    t: fr => fr, esc: String, icon: () => '', badge: () => '', btn: (action, label) => `<button data-action="${action}">${label}</button>`,
    liveFabrication: () => '<section>Fabrication</section>', liveFilaments: () => '<section>Filaments</section>',
    manualControlsPanel: (_m, part) => `<section data-control-test="${part}"></section>`, liveTemperatures: () => '',
    filesPanel: () => '<section data-files></section>', terminalPanel: () => '<section data-terminal></section>',
    renderLive: () => { renders++; }, app: { querySelector: () => ({ focus() {} }) } };
  const code = source.slice(source.indexOf('// Keep a shared layout'), source.indexOf('function showPreview('));
  runInNewContext(code + '\nthis.render=liveDetail;this.select=selectMachineTab;', sandbox);
  let html = sandbox.render();
  assert.match(html, /data-camera-panel/); assert.match(html, /data-control-test="heat"/); assert.match(html, /data-control-test="motion"/);
  assert.doesNotMatch(html, /data-files|data-terminal/);
  sandbox.select('files'); html = sandbox.render();
  assert.match(html, /data-files/); assert.doesNotMatch(html, /data-camera-panel|data-control-test=/);
  sandbox.select('console'); assert.equal(renders, 1, 'console Bambu non proposée');
  sandbox.state.machine = 'two'; sandbox.select('console'); html = sandbox.render();
  assert.match(html, /data-terminal/); assert.doesNotMatch(html, /data-files|data-camera-panel/);
  sandbox.state.machine = 'one'; assert.match(sandbox.render(), /data-files/, 'onglet conservé par machine');
});

test('cockpit : quatre modules réels, seize bobines étroites, modules absents sans faux panneau', () => {
  const sandbox = { machineConnectors: connectorCatalog, t: fr => fr, esc: String };
  const code = source.slice(source.indexOf('function liveFilaments('), source.indexOf('const machineTabs ='));
  runInNewContext(code + '\nthis.filaments=liveFilaments;', sandbox);
  const machine = { kind: 'bambu', filaments: [0,1,2,3].map(id => ({ id, variant: null, slots: [0,1,2,3].map(slot => ({ id: slot, occupied: true, color: '#FFF144', material: 'PLA', active: id === 3 && slot === 2 })) })) };
  const html = sandbox.filaments(machine);
  assert.equal((html.match(/class="filament-module"/g) ?? []).length, 4);
  assert.equal((html.match(/class="filament-spool"/g) ?? []).length, 16);
  assert.match(html, /Filaments · AMS × 4/); assert.match(html, />D3<\/span>/);
  assert.equal(sandbox.filaments({ kind: 'bambu', filaments: [] }), '');
  assert.equal(sandbox.filaments({ kind: 'xtool-m2' }), '');
});

test('cockpit : la saisie d’une consigne survit aux actualisations des autres blocs', () => {
  const active = {};
  const heat = { dataset: { manualControls: 'heat' }, outerHTML: 'target=235', contains: node => node === active };
  const quick = { dataset: { manualControls: 'quick' }, outerHTML: 'old fan value', contains: () => false };
  const sandbox = { state: { machine: 'one' }, live: { page: 'detail' }, document: { activeElement: active },
    machine: () => ({ id: 'one' }), app: { querySelectorAll: () => [heat, quick] }, manualControlsPanel: (_m, part) => 'updated:' + part };
  const code = source.slice(source.indexOf('function renderManualControls('), source.indexOf('async function loadManualControls('));
  runInNewContext(code + '\nthis.update=renderManualControls;', sandbox);
  sandbox.update('one');
  assert.equal(heat.outerHTML, 'target=235'); assert.equal(quick.outerHTML, 'updated:quick');
  sandbox.update('one', true); assert.equal(heat.outerHTML, 'updated:heat', 'actualisation explicitement demandée');
});

test('humidité : une goutte par module avec pourcentage réel, rien pour une mesure absente', () => {
  const sandbox = { machineConnectors: connectorCatalog, t: fr => fr, esc: String };
  const code = source.slice(source.indexOf('function liveFilaments('), source.indexOf('const machineTabs ='));
  runInNewContext(code + '\nthis.filaments=liveFilaments;', sandbox);
  for (const kind of ['bambu', 'elegoo']) {
    const html = sandbox.filaments({ kind, filaments: [34, 0, null, 101].map((humidity, id) => ({ id, humidity, slots: [] })) });
    assert.equal((html.match(/class="filament-humidity"/g) ?? []).length, 2);
    assert.match(html, /Humidité 34 %/); assert.match(html, /Humidité 0 %/);
    assert.doesNotMatch(html, /Humidité null|Humidité 101/);
  }
});

test('cockpit commun : six blocs stables, fonctions absentes inertes, aucune caméra fictive', () => {
  const sourceHelpers = source.slice(source.indexOf('// Keep a shared layout'), source.indexOf('function showPreview('));
  const manual = source.slice(source.indexOf('const manualStates ='), source.indexOf('function renderManualControls('));
  const temperatures = source.slice(source.indexOf('function temperatureReadings('), source.indexOf('// Compact fleet summary'));
  const sandbox = { state: { machine: 'one', role: 'admin', lang: 'fr' }, machineConnectors: connectorCatalog,
    t: (fr, en) => sandbox.state.lang === 'fr' ? fr : en, esc: value => String(value).replaceAll('<', '&lt;'),
    icon: () => '', badge: () => '', btn: (action, label, _icon, _class, extra = '') => `<button data-action="${action}" ${extra}>${label}</button>`,
    temperaturePlot: () => '', liveFabrication: () => '<section><h2>Fabrication</h2></section>', liveFilaments: () => '',
    machine: () => sandbox.current };
  runInNewContext(sourceHelpers + manual + temperatures + '\nthis.render=liveDetail;this.entry=manualState;this.materials=liveMaterials;', sandbox);
  for (const kind of ['klipper', 'bambu', 'bambu-cloud', 'xtool-m2']) {
    sandbox.current = { id: kind, kind, name: kind, model: kind, status: 'ready', nozzle: 22, bed: 20 };
    let html = sandbox.render();
    for (const title of ['Caméra', 'Fabrication', 'Températures', 'Actions rapides', 'Déplacements']) assert.ok(html.includes(`<h2>${title}</h2>`), kind + ': ' + title);
    assert.match(html, /data-live-filaments/);
    assert.doesNotMatch(html, /cockpit-grid:not\(:has/);
    if (!connectorCatalog[kind].camera) {
      assert.match(html, /Caméra non prise en charge/);
      assert.doesNotMatch(html, /<div data-live-camera|data-action="camera-start"/);
    }
    if (!connectorCatalog[kind].controls) assert.doesNotMatch(html, /data-manual-form=|data-action="manual-(?:home|jog|light|off)/);
    for (const fragment of html.matchAll(/<div class="unavailable-skeleton"[^>]*>([\s\S]*?)<\/div>/g)) {
      assert.match(fragment[0], /aria-hidden="true" inert/);
      assert.doesNotMatch(fragment[1], /data-action=|data-manual-form=/);
      for (const control of fragment[1].matchAll(/<(?:button|input)[^>]*>/g)) assert.match(control[0], /disabled tabindex="-1"/);
    }
    sandbox.state.role = 'viewer';
    html = sandbox.render();
    assert.match(html, /<h2>Déplacements<\/h2>/);
    assert.doesNotMatch(html, /data-manual-form=|data-action="manual-(?:home|jog|light|off)/);
    sandbox.state.role = 'admin';
  }
  sandbox.current = { id: 'bambu', kind: 'bambu', status: 'offline' };
  assert.match(sandbox.materials(sandbox.current), /temporairement inaccessibles/);
  sandbox.current.status = 'ready'; sandbox.current.filaments = [];
  assert.match(sandbox.materials(sandbox.current), /Aucun module multibobine signalé/);
  sandbox.state.lang = 'en';
  assert.match(sandbox.render(), /Camera|Temperatures/);
  assert.match(sandbox.materials({kind:'xtool-m2'}), /Not applicable/);
});
