import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import ICU from 'i18next-icu';
import { I18nextProvider } from 'react-i18next';
import { createServer } from 'vite';
import { parseRoute } from '../src/route.ts';
const resources = { fr: Object.fromEntries(readdirSync(new URL('../locales/fr/', import.meta.url)).filter(name => name.endsWith('.json')).map(name => [name.slice(0, -5), JSON.parse(readFileSync(new URL('../locales/fr/' + name, import.meta.url), 'utf8'))])) };
const i18n = createInstance(); await i18n.use(ICU).init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
const vite = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' }); after(() => vite.close());
const { ConsolePanel, quickCommands } = await vite.ssrLoadModule('/src/components/console/ConsolePanel.tsx');
const { MachineHeader } = await vite.ssrLoadModule('/src/components/machine/MachineHeader.tsx');
const machine = { id: '11111111-1111-4111-8111-111111111111', name: 'Ender <b>', model: 'Klipper', kind: 'klipper', status: 'ready', capabilities: { terminal: true }, cameraOpen: false };
const render = component => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, component));
const api = new Proxy({}, { get() { return () => assert.fail('aucun envoi au rendu'); } });

test('Console : onglet React pour l’administrateur et les machines avec terminal', () => {
  assert.deepEqual(parseRoute('#machine/' + machine.id + '/console'), { kind: 'machine', id: machine.id, tab: 'console' });
  assert.match(render(createElement(MachineHeader, { machine, role: 'admin' })), /#machine\/[^"]+\/console"/);
  assert.doesNotMatch(render(createElement(MachineHeader, { machine, role: 'admin' })), /tab=console/);
  assert.doesNotMatch(render(createElement(MachineHeader, { machine, role: 'observer' })), /\/console"/);
  assert.doesNotMatch(render(createElement(MachineHeader, { machine: { ...machine, capabilities: {} }, role: 'admin' })), /\/console"/);
});
test('Console : saisie, lectures rapides selon le connecteur, cible échappée, rien n’est envoyé au rendu', () => {
  assert.deepEqual(quickCommands('klipper'), ['HELP', 'STATUS', 'QUERY_ENDSTOPS', 'GET_POSITION', 'M105']);
  assert.deepEqual(quickCommands('octoprint'), ['M105', 'M114', 'M115']);
  const html = render(createElement(ConsolePanel, { machine, api }));
  assert.match(html, /Console G-code/); assert.match(html, /maxLength="256"|maxlength="256"/); assert.match(html, />HELP<\/button>/);
  assert.match(html, /Ender &lt;b&gt;/); assert.match(html, /Aucune commande envoyée/);
});
