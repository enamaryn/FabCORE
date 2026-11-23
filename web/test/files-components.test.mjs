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
import { connectionSignature } from '../src/file-batch.ts';
const resources = { fr: Object.fromEntries(readdirSync(new URL('../locales/fr/', import.meta.url)).filter(n => n.endsWith('.json')).map(n => [n.slice(0, -5), JSON.parse(readFileSync(new URL('../locales/fr/' + n, import.meta.url), 'utf8'))])) };
const i18n = createInstance(); await i18n.use(ICU).init({ resources, lng: 'fr', interpolation: { escapeValue: false } });
const server = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, logLevel: 'error' });
after(() => server.close());
const { MachineDetail } = await server.ssrLoadModule('/src/components/machine/MachineDetail.tsx');
const { PrintFileDialog } = await server.ssrLoadModule('/src/components/files/PrintFileDialog.tsx');
const id = '11111111-1111-4111-8111-111111111111';
const machine = { id, name: 'Ender', kind: 'klipper', origin: 'http://192.168.1.40:7125', model: 'Moonraker', status: 'ready', cameraOpen: false, capabilities: { files: true, commands: true } };
const api = new Proxy({}, { get() { return () => assert.fail('SSR must not contact any machines'); } });
function render(m = machine, role = 'admin', inventory = { files: Array.from({ length: 22 }, (_, i) => ({ path: `folder/part${i + 1}.gcode`, size: null, modified: null })), truncated: true }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['files', role, id, connectionSignature(m)], inventory);
  try { return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(I18nextProvider, { i18n }, createElement(MachineDetail, { id, machines: [m], api, actor: role, role, tab: 'files', samples: [], stale: false })))); }
  finally { client.clear(); }
}
test('React fichiers : onglet exact sans caméra, cinq lignes, inconnus explicites et droits lecture/écriture', () => {
  const html = render(); assert.equal((html.match(/<tr>/g) ?? []).length, 6); assert.match(html, /Page 1 \/ 5/); assert.match(html, /300 fichiers chargés/); assert.match(html, /Non communiqué/);
  assert.match(html, /Envoyer un fichier/); assert.match(html, />Transférer<\/button>/); assert.match(html, />Lancer<\/button>/); assert.doesNotMatch(html, /data-machine-block|<img|<video/);
  assert.match(html, /aria-current="page">Fichiers/); assert.match(html, /view\/folder%2Fpart1.gcode"/); assert.match(html, /download=1&amp;path=folder%2Fpart1.gcode/);
  const observer = render(machine, 'observer'); assert.doesNotMatch(observer, /type="file"|>Transférer<\/button>|>Lancer<\/button>/); assert.match(observer, />Télécharger<\/a>/); assert.match(observer, />Visualiser<\/a>/);
});
test('React fichiers : limites de stockage honnêtes et absence de fausse liste vide après erreur ou hors ligne', () => {
  const retained = render({ ...machine, kind: 'elegoo-cc1', capabilities: { files: true, retainedOnly: true } }, 'admin', { files: [], truncated: false });
  assert.match(retained, /Fichiers envoyés via FabCore/); assert.match(retained, /préinstallés/); assert.doesNotMatch(retained, /Aucun fichier pris en charge/);
  const unsupported = render({ ...machine, kind: 'bambu-cloud', capabilities: {} }); assert.match(unsupported, /stockage distant n’est pas accessible/); assert.match(unsupported, /Visualiser un fichier local/); assert.doesNotMatch(unsupported, /Envoyer un fichier|Chargement de la liste/);
  const offline = render({ ...machine, status: 'offline' }); assert.match(offline, /Connexion indisponible/); assert.doesNotMatch(offline, />Télécharger<\/a>|>Lancer<\/button>/);
  const ray = render({ ...machine, kind: 'longer-ray5', status: 'printing' }); assert.match(ray, /uniquement à l’arrêt/); assert.doesNotMatch(ray, />Télécharger<\/a>|>Lancer<\/button>/);
});
test('React fichiers : chemins échappés, lancement exige confirmation, laser et externe explicites', () => {
  const path = 'usb/<part>&.gcode', html = render(machine, 'admin', { files: [{ path, size: 12, modified: 0 }], truncated: false }); assert.match(html, /&lt;part&gt;&amp;.gcode/); assert.doesNotMatch(html, /<part>/); assert.match(html, /view\/usb%2F%3Cpart%3E%26.gcode"/);
  const dialog = m => renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(PrintFileDialog, { machine: m, path, role: 'admin', stale: false, api, close() {}, changed() {} })));
  assert.match(dialog(machine), /type="checkbox" required/); assert.match(dialog(machine), /type="submit"[^>]+disabled/);
  assert.match(dialog({ ...machine, kind: 'longer-ray5' }), /Je suis présent/);
  assert.match(dialog({ ...machine, capabilities: { files: true, externalFilament: true } }), /aucun choix automatique AMS\/CANVAS/);
});
