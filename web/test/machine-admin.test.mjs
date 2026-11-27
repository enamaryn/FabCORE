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
const { initialDraft, payload } = await vite.ssrLoadModule('/src/components/machines/MachineForm.tsx');
const { AddMachinePage } = await vite.ssrLoadModule('/src/components/machines/AddMachinePage.tsx');
const { MachineSettings, networkFor } = await vite.ssrLoadModule('/src/components/machines/MachineSettings.tsx');
const connectors = [
  { kind: 'klipper', model: 'Klipper · Moonraker', form: 'http', port: 7125, required: false },
  { kind: 'longer-ray5', model: 'Longer · Ray5 Wi-Fi', form: 'longer-ray5', port: null, required: false },
  { kind: 'elegoo', model: 'Elegoo · Centauri Carbon 2', form: 'elegoo', port: null, required: false },
  { kind: 'bambu', model: 'Bambu Lab · P2S', form: 'bambu', port: null, required: false },
];
const render = (component, data = {}) => { const client = new QueryClient(); for (const [key, value] of Object.entries(data)) client.setQueryData([key], value); return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(I18nextProvider, { i18n }, component))); };
const api = new Proxy({}, { get() { return () => assert.fail('aucune requête au rendu'); } });

test('Machine : brouillon repris de la fiche (ports Ray5, IP) et corps limité aux champs du type', () => {
  const ray5 = { id: 'r', name: 'Ray5', kind: 'longer-ray5', origin: 'http://192.168.1.57:8848', transport: 'esp3d', httpPort: 8848, wsPort: 8849, status: 'ready', cameraOpen: false };
  const draft = initialDraft('longer-ray5', 'longer-ray5', ray5);
  assert.deepEqual([draft.host, draft.transport, draft.port, draft.wsPort, draft.httpPort], ['192.168.1.57', 'esp3d', '8848', '8849', '8848']);
  assert.deepEqual(payload(draft, 'longer-ray5', 'r'), { kind: 'longer-ray5', name: 'Ray5', id: 'r', host: '192.168.1.57', transport: 'esp3d', port: '8848', wsPort: '8849', httpPort: '8848' });
  const klipper = initialDraft('klipper', 'http', { id: 'k', name: 'Ender', kind: 'klipper', origin: 'http://192.168.1.20:7125' });
  assert.deepEqual(payload({ ...klipper, apiKey: '' }, 'http', 'k'), { kind: 'klipper', name: 'Ender', id: 'k', origin: 'http://192.168.1.20:7125', apiKey: '' }, 'clé vide = conservée par le serveur');
  const cc2 = initialDraft('elegoo', 'elegoo', null, { kind: 'elegoo', host: '192.168.1.30', serial: 'CC2SERIAL' });
  assert.deepEqual(payload({ ...cc2, name: 'CC2', accessCode: 'abc' }, 'elegoo'), { kind: 'elegoo', name: 'CC2', host: '192.168.1.30', accessCode: 'abc' }, 'série jamais envoyée pour la CC2');
  assert.equal(networkFor('192.168.1.57', ['10.0.0.0/24', '192.168.1.0/24']), '192.168.1.0/24');
  assert.equal(networkFor('', ['10.0.0.0/24']), '10.0.0.0/24');
});
test('Ajout : routes dédiées, scan et types proposés, aucune requête au rendu', () => {
  assert.deepEqual(parseRoute('#machines/add'), { kind: 'machine-add' });
  assert.deepEqual(parseRoute('#machine/11111111-1111-4111-8111-111111111111/settings'), { kind: 'machine', id: '11111111-1111-4111-8111-111111111111', tab: 'settings' });
  const html = render(createElement(AddMachinePage, { api }), { connectors, networks: ['192.168.1.0/24'] });
  assert.match(html, /Ajouter une machine/); assert.match(html, /Lancer le scan/); assert.match(html, /192\.168\.1\.0\/24/);
  for (const model of ['Klipper · Moonraker', 'Longer · Ray5 Wi-Fi', 'Bambu Lab · P2S']) assert.match(html, new RegExp(model));
});
test('Paramètres : champs de la connexion, secret jamais affiché, Détecter à nouveau et suppression confirmée', () => {
  const machine = { id: 'b', name: 'P2S', kind: 'bambu', origin: 'mqtts://192.168.1.40:8883', serial: '01P00A123', status: 'ready', cameraOpen: false };
  const html = render(createElement(MachineSettings, { machine, api }), { connectors });
  assert.match(html, /Paramètres de la machine/); assert.match(html, /Détecter à nouveau/); assert.match(html, />Supprimer la machine<\/button>/);
  assert.match(html, /Vide = valeur enregistrée conservée/); assert.doesNotMatch(html, /accessCode"[^>]*value="[^"]+/);
  assert.match(render(createElement(MachineSettings, { machine: { ...machine, kind: 'bambu-cloud' }, api }), { connectors }), /comptes cloud/);
});
