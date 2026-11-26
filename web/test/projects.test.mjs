import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import { I18nextProvider } from 'react-i18next';
import { createServer } from 'vite';
import { projectFields } from '../../src/domain/projects.ts';
import { parseRoute } from '../src/route.ts';
const resources = { fr: Object.fromEntries(readdirSync(new URL('../locales/fr/', import.meta.url)).filter(name => name.endsWith('.json')).map(name => [name.slice(0, -5), JSON.parse(readFileSync(new URL('../locales/fr/' + name, import.meta.url), 'utf8'))])) };
const i18n = createInstance(); await i18n.use(ICU).init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
const vite = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' }); after(() => vite.close());
const { ProjectBoardView } = await vite.ssrLoadModule('/src/components/projects/ProjectsPage.tsx');
const at = '2026-11-26T12:00:00.000Z';
const project = { ...projectFields({ title: '<Projet & client>', origin: 'client', client: 'Demande <A>', format: 'mixed', stage: 'design', tags: ['2D', '3D'], blockedReason: 'Dimensions à confirmer', checklist: [{ text: 'Prototype', done: false }] }),
  id: '11111111-1111-4111-8111-111111111111', revision: 1, createdAt: at, updatedAt: at, createdBy: 'atelier', history: [{ at, actor: 'atelier', action: 'created' }] };
function render(role) { return renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(ProjectBoardView, { board: { version: 1, projects: [project], work: [] }, machines: [], role, busy: false, error: '', clearError() {}, write() { assert.fail('SSR never writes'); }, refresh() { assert.fail('SSR never fetches'); } }))); }

test('Kanban : étapes créatives, textes échappés et changement d’étape accessible sans glisser-déposer', () => {
  const html = render('admin');
  for (const text of ['Idées', 'À cadrer', 'Conception', 'Prototype', 'Création finalisée', 'À produire']) assert.match(html, new RegExp(text));
  assert.match(html, /&lt;Projet &amp; client&gt;/); assert.match(html, /Dimensions à confirmer/); assert.match(html, /Changer l’étape de/);
  assert.match(html, /draggable="true"/); assert.doesNotMatch(html, /<Projet|\/command|\/print|<img|<video/);
  assert.deepEqual(parseRoute('#projects'), { kind: 'projects' });
});
test('Kanban : observateur sans création, édition ni glisser-déposer', () => {
  const html = render('observer'); assert.match(html, /Lecture seule/); assert.match(html, /&lt;Projet/);
  assert.doesNotMatch(html, /Nouvelle idée|Changer l’étape de|draggable="true"/);
});
