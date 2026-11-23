import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import { I18nextProvider } from 'react-i18next';
import { IntlMessageFormat } from 'intl-messageformat';
import { createServer } from 'vite';

const resources = Object.fromEntries(['fr', 'en'].map(lang => [lang, Object.fromEntries(readdirSync(new URL('../locales/fr/', import.meta.url)).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)).map(ns => [ns, JSON.parse(readFileSync(new URL(`../locales/${lang}/${ns}.json`, import.meta.url), 'utf8'))]))]));
const i18n = createInstance(); await i18n.use(ICU).init({ resources, lng: 'fr', defaultNS: 'common', fallbackLng: ['en', 'fr'], interpolation: { escapeValue: false } });
const server = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
after(() => server.close());
const { FleetPage, FilamentDots, Shell } = await server.ssrLoadModule('/src/components/index.ts');
const { resources: bundledResources } = await server.ssrLoadModule('/src/i18n.ts');
const render = (component, props) => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(component, props)));
const machine = { id: 'test-id', name: '<img src=x onerror=alert(1)>', kind: 'bambu', model: 'P2S', status: 'ready', cameraOpen: false, nozzle: null, bed: null };
function flatten(data, prefix = '') { return Object.entries(data).flatMap(([key, value]) => typeof value === 'string' ? [[prefix + key, value]] : flatten(value, prefix + key + '.')); }
test('React : catalogues complets FR/EN, aucune clé orpheline et syntaxe ICU valide', () => {
  assert.deepEqual(bundledResources, resources, 'Les catalogues chargés par Vite correspondent aux catalogues validés');
  for (const ns of Object.keys(resources.fr)) {
    const fr = flatten(resources.fr[ns]), en = flatten(resources.en[ns]);
    assert.deepEqual(fr.map(([key]) => key).sort(), en.map(([key]) => key).sort());
    for (const [lang, data] of [['fr', fr], ['en', en]]) for (const [, value] of data) assert.doesNotThrow(() => new IntlMessageFormat(value, lang));
  }
});
test('React parc : toutes les machines, inconnus explicites, texte échappé, aucune caméra et observateur sans ajout', () => {
  const html = render(FleetPage, { machines: Array.from({ length: 8 }, (_, i) => ({ ...machine, id: 'test-' + i })), overview: true, role: 'observer', events: [] });
  assert.equal((html.match(/<article/g) ?? []).length, 8);
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /onerror="|<img|<video|camera\/|screen=add/);
  assert.match(html, /Non communiqué/); assert.doesNotMatch(html, /0 °C/);
});
test('React pastilles : priorité des modules réels, actif, multi-module compact et couleur confinée', () => {
  const data = { ...machine, manualSpool: { material: 'ABS', color: '#FF00FF' }, filaments: [
    { id: 0, slots: [{ id: 0, occupied: true, color: '#FFFFFF' }] },
    { id: 1, slots: [{ id: 0, occupied: true, color: '#000000', active: true }, { id: 1, occupied: false }, { id: 2, color: 'url(javascript:alert(1))' }] },
  ] };
  const html = render(FilamentDots, { machine: data });
  assert.match(html, /2 AMS/); assert.match(html, /data-active="true"/); assert.match(html, /data-empty="true"/);
  assert.doesNotMatch(html, /javascript:|#FF00FF|Saisie manuelle/);
  const manual = render(FilamentDots, { machine: { ...machine, manualSpool: data.manualSpool } });
  assert.match(manual, /Saisie manuelle/); assert.match(manual, /#FF00FF/);
  assert.equal(render(FilamentDots, { machine: { ...machine, kind: 'longer-ray5' } }), '');
});
test('React navigation : rôle observateur sans administration et interface conservée reliée explicitement', () => {
  const props = { username: 'Atelier', page: 'machines', language: 'fr', theme: 'system', onLanguage() {}, onTheme() {}, onLogout() {} };
  const observer = render(Shell, { ...props, role: 'observer' });
  assert.doesNotMatch(observer, /screen=cloud|screen=observer|screen=diagnostics/);
  assert.match(observer, /Navigation mobile/); assert.match(observer, /aria-current="page"/);
  const admin = render(Shell, { ...props, role: 'admin' }); assert.match(admin, /screen=cloud/); assert.match(admin, /href="#notifications"/, "notifications : écran React (#121)");
});
