import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import { I18nextProvider } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createServer } from 'vite';
const resources = { fr: Object.fromEntries(readdirSync(new URL('../locales/fr/', import.meta.url)).filter(n => n.endsWith('.json')).map(n => [n.slice(0, -5), JSON.parse(readFileSync(new URL('../locales/fr/' + n, import.meta.url), 'utf8'))])) };
const i18n = createInstance(); await i18n.use(ICU).init({ resources, lng: 'fr', defaultNS: 'machine', interpolation: { escapeValue: false } });
const server = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
after(() => server.close());
const { MachineDetail } = await server.ssrLoadModule('/src/components/machine/MachineDetail.tsx');
const { TemperatureChart } = await server.ssrLoadModule('/src/components/machine/TemperatureChart.tsx');
const id = '11111111-1111-4111-8111-111111111111';
const machine = { id, name: '<unsafe>', kind: 'bambu', model: 'P2S', status: 'printing', checkedAt: '2026-11-23T12:00:00Z', nozzle: 140, bed: 55, cameraOpen: false, capabilities: { camera: true, commands: true, commandActions: ['pause', 'resume', 'stop'], controls: true, filaments: 'AMS', files: true, terminal: true } };
const api = new Proxy({}, { get() { return () => assert.fail('SSR must not contact a machine'); } });
function render(data = machine, role = 'admin') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try { return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(I18nextProvider, { i18n }, createElement(MachineDetail, { id, machines: [data], api, actor: role, role, samples: [], stale: false })))); }
  finally { client.clear(); }
}
test('Cockpit : six blocs stables, aucun flux automatique ni fabrication inventée, noms échappés', () => {
  for (const kind of ['bambu', 'bambu-cloud', 'elegoo', 'elegoo-cc1', 'xtool-m2', 'longer-ray5', 'klipper', 'prusalink']) {
    const html = render({ ...machine, kind, nozzle: null, bed: null, capabilities: kind === 'bambu-cloud' ? { filaments: 'AMS' } : machine.capabilities });
    assert.equal((html.match(/data-machine-block=/g) ?? []).length, 6, kind);
    assert.doesNotMatch(html, /<img|<video|src=".*camera|0 °C/); assert.match(html, /&lt;unsafe&gt;/);
    assert.match(html, /Avancement non communiqué/);
  }
});
test('Cockpit : pause/stop selon état et capacités, aucun bouton d’écriture pour observateur ou cloud', () => {
  assert.match(render(), />Pause<\/button>/); assert.match(render(), />Stop<\/button>/); assert.doesNotMatch(render(), />Reprendre<\/button>/);
  const observer = render(machine, 'observer'); assert.doesNotMatch(observer, />Pause<\/button>|>Stop<\/button>|\/logs"|Renseigner la bobine|Paramètres de la machine/);
  const paused = render({ ...machine, status: 'paused' }); assert.match(paused, />Reprendre<\/button>/); assert.doesNotMatch(paused, />Pause<\/button>/);
  const cloud = render({ ...machine, kind: 'bambu-cloud', capabilities: { filaments: 'AMS' } }); assert.match(cloud, /lecture seule/); assert.doesNotMatch(cloud, />Pause<\/button>|>Stop<\/button>/);
  assert.doesNotMatch(render({ ...machine, status: 'offline' }), />Pause<\/button>|>Stop<\/button>/);
});
test('Cockpit : quatre modules compacts, humidité bornée et priorité sur bobine manuelle', () => {
  const html = render({ ...machine, manualSpool: { material: 'ABS', color: '#AABBCC' }, filaments: Array.from({ length: 4 }, (_, i) => ({ id: i, humidity: i === 3 ? 120 : 28, slots: [{ id: 0, material: 'PETG', occupied: true, color: '#FFFFFF' }, { id: 1, occupied: false }] })) });
  // P2S : illustration AMS (A1…A4), humidité bornée affichée dans la capsule, valeur hors bornes ignorée.
  assert.equal((html.match(/class="react-filament-module filament-art-module"/g) ?? []).length, 4); assert.equal((html.match(/>28%<\/text>/g) ?? []).length, 3);
  assert.match(html, /aria-label="A1 : PETG, #FFFFFF · A2 : Vide/); assert.match(html, />A1<\/text>/);
  // CC1/CC2 : illustration CANVAS (bobines rondes numérotées).
  for (const kind of ['elegoo', 'elegoo-cc1']) { const canvas = render({ ...machine, kind, filaments: [{ id: 0, slots: [{ id: 0, material: 'TPU', occupied: true, color: '#E8455A', active: true }, { id: 3, material: 'PLA', occupied: true, color: '#111111' }] }] }); assert.match(canvas, /class="filament-art canvas-art"/); assert.match(canvas, /1 : TPU, #E8455A, Actif · 2 : Vide · 3 : Vide · 4 : PLA, #111111/); }
  assert.doesNotMatch(html, /120 %|#AABBCC|>ABS<|Modifier la bobine/); assert.match(html, /#machine\/11111111-1111-4111-8111-111111111111\/files/); assert.match(html, /#machine\/11111111-1111-4111-8111-111111111111\/logs/);
});
test('Températures : ruptures pointillées et historique vide explicite', () => {
  const renderChart = samples => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(TemperatureChart, { samples })));
  assert.match(renderChart([]), /En attente/);
  assert.match(renderChart([{ at: 100000, nozzle: 23, bed: null }, { at: 150000, nozzle: 30, bed: null }]), /stroke-dasharray="3 4"/);
  assert.match(renderChart([{ at: 100000, nozzle: 23, bed: null }, { at: 150000, nozzle: 30, bed: null }]), /mesures espacées/);
});
