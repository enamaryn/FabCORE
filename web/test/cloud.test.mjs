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
const { CloudAccountsPage, logLabel } = await vite.ssrLoadModule('/src/components/cloud/CloudAccountsPage.tsx');
const api = new Proxy({}, { get() { return () => assert.fail('aucune requête au rendu'); } });
const overview = { providers: [{ id: 'bambu', name: 'Bambu Lab', available: true }, { id: 'elegoo', name: 'Elegoo', available: false }], accounts: [
  { id: 'a1', name: 'Atelier <b>', provider: 'bambu', email: 'me@example.test', region: 'global', status: 'connected', checkedAt: '2026-11-27T10:00:00Z', telemetryEnabled: true,
    devices: [{ serial: '01P00A1', name: 'P2S', model: 'P2S', status: 'RUNNING' }, { serial: '01P00A2', name: 'X1C', model: 'X1C', online: false }],
    telemetry: { status: 'connecté', devices: [{ serial: '01P00A1', checkedAt: '2026-11-27T10:00:00Z', heaters: [{ id: 'nozzle', current: 210, target: 210 }], filaments: [{ id: 0, humidity: 3, slots: [{ id: 0, color: '#FF0000', material: 'PLA' }, { id: 1, color: 'red;background:url(x)', occupied: false }] }], modules: [] }] } },
  { id: 'a2', name: 'Elegoo', provider: 'elegoo', email: '', status: 'disconnected', devices: [] },
] };
const render = (machines = []) => { const client = new QueryClient(); client.setQueryData(['cloud-accounts'], overview); client.setQueryData(['cloud-certificates'], { configured: true, fingerprint: 'AB:CD', refreshConfigured: false }); return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(I18nextProvider, { i18n }, createElement(CloudAccountsPage, { api, machines })))); };

test('Comptes cloud : route React, certificats, comptes, actions selon l’état', () => {
  assert.deepEqual(parseRoute('#cloud'), { kind: 'cloud' });
  const html = render([{ id: 'm1', name: 'P2S', kind: 'bambu-cloud', serial: '01P00A1', status: 'printing' }]);
  assert.match(html, /Certificats applicatifs Bambu/); assert.match(html, /AB:CD/); assert.match(html, /Renouvellement manuel/);
  assert.match(html, /Atelier &lt;b&gt;/); assert.match(html, /Authentifié/); assert.match(html, /Relire les machines/); assert.match(html, /Arrêter le suivi cloud/);
  assert.match(html, />Supprimer de FabCore<\/button>/, 'machine déjà au parc'); assert.match(html, />Ajout automatique<\/button>/, 'machine absente du parc');
  assert.match(html, /connecteur cloud non encore intégré/); assert.match(html, /210 °C → 210 °C/);
  assert.match(html, /background:#FF0000/); assert.doesNotMatch(html, /url\(x\)/, 'couleur non conforme ignorée');
  assert.doesNotMatch(html, /type="password"/, 'aucun champ secret hors dialogue');
});
test('Comptes cloud : libellés du journal', () => {
  const t = i18n.getFixedT('fr', 'cloud');
  assert.equal(logLabel(t, { at: '', event: 'devices-read', method: 'GET', path: '/v1/iot', status: 200, count: 2 }), 'Inventaire des machines reçu · GET /v1/iot · HTTP 200 · 2 machines');
  assert.equal(logLabel(t, { at: '', event: 'inconnu' }), 'inconnu');
});
