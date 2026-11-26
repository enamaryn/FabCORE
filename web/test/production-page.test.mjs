import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import { I18nextProvider } from 'react-i18next';
import { createServer } from 'vite';
import { workFields } from '../../src/domain/projects.ts';
import { parseRoute } from '../src/route.ts';
const resources = { fr: Object.fromEntries(readdirSync(new URL('../locales/fr/', import.meta.url)).filter(name => name.endsWith('.json')).map(name => [name.slice(0, -5), JSON.parse(readFileSync(new URL('../locales/fr/' + name, import.meta.url), 'utf8'))])) };
const i18n = createInstance(); await i18n.use(ICU).init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
const vite = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' }); after(() => vite.close());
const { ProductionBoard } = await vite.ssrLoadModule('/src/components/production/ProductionPage.tsx');
const { WorkEditor } = await vite.ssrLoadModule('/src/components/projects/ProjectEditor.tsx');
const at = '2026-11-26T12:00:00.000Z';
const work = { ...workFields({ title: '<Commande directe>', client: 'Client <A>', estimatedMinutes: 60 }), id: '11111111-1111-4111-8111-111111111111', projectId: null, machineNameSnapshot: null, revision: 1, createdAt: at, updatedAt: at, createdBy: 'atelier' };
function render(role, items = [work]) { return renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(ProductionBoard, { board: { version: 1, projects: [], work: items }, machines: [], role, busy: false, error: '', clearError() {}, write() { assert.fail('SSR never writes'); }, refresh() { assert.fail('SSR never fetches'); } }))); }

test('Production : création et réserve sans projet ni machine, contenu échappé et aucune commande', () => {
  const html = render('admin');
  assert.match(html, /Nouvelle fabrication/); assert.match(html, /À planifier/); assert.match(html, /&lt;Commande directe&gt;/); assert.match(html, /Client &lt;A&gt;/);
  assert.match(html, /Échelle horaire/); assert.match(html, /23:00/); assert.match(html, /Ajoutez une machine/); assert.match(html, /draggable="true"/); assert.doesNotMatch(html, /\/command|\/print|<img|<video/);
  assert.deepEqual(parseRoute('#production'), { kind: 'production' });
});
test('Production : observateur sans création ni déplacement et travaux annulés exclus', () => {
  const html = render('observer', [work, { ...work, id: 'cancelled', title: 'NE PAS AFFICHER', state: 'cancelled' }]);
  assert.match(html, /Lecture seule/); assert.match(html, /&lt;Commande directe&gt;/);
  assert.doesNotMatch(html, /Nouvelle fabrication|draggable="true"|NE PAS AFFICHER/);
});
test('Production : formulaire autonome sans Kanban avec client et créneau local facultatif', () => {
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(WorkEditor, { project: null, work: null, machines: [], busy: false, error: '', close() {}, save() { assert.fail('SSR never writes'); } })));
  assert.match(html, /Fabrication directe, sans projet/); assert.match(html, /Client \/ référence/); assert.match(html, /datetime-local/); assert.match(html, /Durée totale estimée/);
});
