import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import { I18nextProvider } from 'react-i18next';
import { createServer } from 'vite';
import { parseRoute } from '../src/route.ts';
const resources = { fr: Object.fromEntries(readdirSync(new URL('../locales/fr/', import.meta.url)).filter(name => name.endsWith('.json')).map(name => [name.slice(0, -5), JSON.parse(readFileSync(new URL('../locales/fr/' + name, import.meta.url), 'utf8'))])) };
const i18n = createInstance(); await i18n.use(ICU).init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
const vite = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' }); after(() => vite.close());
const { TrammingPanel, turns, flatnessLevel } = await vite.ssrLoadModule('/src/components/tramming/TrammingPanel.tsx');
const { MachineHeader } = await vite.ssrLoadModule('/src/components/machine/MachineHeader.tsx');
const machine = { id: '11111111-1111-4111-8111-111111111111', name: 'Ender', model: 'Klipper', kind: 'klipper', status: 'ready', capabilities: { configuration: true }, cameraOpen: false };
const last = { at: '2026-11-27T15:00:00.000Z', range: 0.21, points: [], deviations: [{ corner: 'front-left', delta: 0 }, { corner: 'front-right', delta: 0.12 }, { corner: 'back-right', delta: -0.09 }, { corner: 'back-left', delta: 0.02 }] };
const render = (component, data) => { const client = new QueryClient(); if (data) client.setQueryData(['tramming', machine.id], data); return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(I18nextProvider, { i18n }, component))); };

test('Nivellement : fractions de tour lisibles et niveaux de planéité', () => {
  assert.equal(turns(0.12, 0.7), '1/8'); assert.equal(turns(0.35, 0.7), '1/2'); assert.equal(turns(-1, 0.7), '1 3/8'); assert.equal(turns(0.01, 0.7), '0'); assert.equal(turns(0.25, 0.5), '1/2');
  assert.deepEqual([0.04, 0.05, 0.08, 0.2, 0.21].map(flatnessLevel), ['excellent', 'excellent', 'good', 'improve', 'out']);
});
test('Nivellement : onglet administrateur Klipper seulement, route dédiée', () => {
  assert.match(render(createElement(MachineHeader, { machine, role: 'admin' })), /\/tramming"/);
  assert.doesNotMatch(render(createElement(MachineHeader, { machine, role: 'observer' })), /\/tramming"/);
  assert.doesNotMatch(render(createElement(MachineHeader, { machine: { ...machine, kind: 'bambu' }, role: 'admin' })), /\/tramming"/);
  assert.deepEqual(parseRoute('#machine/' + machine.id + '/tramming'), { kind: 'machine', id: machine.id, tab: 'tramming' });
});
test('Nivellement : coins, consignes en mm et en tours, planéité ; rien n’est envoyé au rendu', () => {
  const html = render(createElement(TrammingPanel, { machine, stale: false, api: {} }), { available: true, offset: { x: -41.5, y: -7 }, points: [], last });
  assert.match(html, /Avant gauche/); assert.match(html, /Référence/);
  assert.match(html, /Abaisser de 0,12 mm/); assert.match(html, /1\/8 tour/); assert.match(html, /Monter de 0,09 mm/); assert.match(html, /✓ OK/);
  assert.match(html, /0,21 mm/); assert.match(html, /Hors tolérance/); assert.match(html, /Nouvelle passe/);
  const busy = render(createElement(TrammingPanel, { machine: { ...machine, status: 'printing' }, stale: false, api: {} }), { available: true, points: [], last: null });
  assert.match(busy, /disabled=""[^>]*>Lancer le nivellement/);
  assert.match(render(createElement(TrammingPanel, { machine, stale: false, api: {} }), { available: false, reason: 'no-probe', last: null }), /Aucune sonde/);
});
