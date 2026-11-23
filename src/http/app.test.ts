import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { test } from 'node:test';
import { createHttpApp, type Viewer } from './app.ts';
import { openApiDocument } from './openapi.ts';
import { migratedRoutes } from './routes/index.ts';

const host = 'fabcore.test';
const viewers: Record<string, Viewer> = {
  admin: { session: 'a', username: 'atelier', role: 'admin' },
  observer: { session: 'o', username: 'lecture', role: 'observer' },
};
const viewer = (request: IncomingMessage) => viewers[String(request.headers.cookie ?? '')] ?? null;
let failures = 0;
function build(view: () => Record<string, unknown> = () => ({ events: [] })) {
  return createHttpApp({ allowedHost: host, origin: 'http://fabcore.test', limit: () => true, viewer, onFailure: () => { failures += 1; } }, migratedRoutes({
    accounts: { installed: () => true, setup: async () => { throw new Error('unused'); }, login: async () => { throw new Error('unused'); }, logout: () => ({ body: { authenticated: false as const }, cookie: '' }), addObserver: async () => ({ username: 'x' }) },
    session: { installed: () => true, oidcEnabled: () => false, viewer },
    diagnostics: { view, fleet: () => [{ id: 'm1', name: 'P2S' }] },
    fleet: { list: async () => [] },
    machines: { write: async () => null, spool: () => ({ manualSpool: null }), networks: () => ({ networks: [] }), discover: async () => null },
    notifications: { view: () => ({ ntfy: { mode: 'off' }, smtp: { enabled: false }, internal: null }), save: () => { throw new Error('unused'); }, test: async () => ({ accepted: true as const }) },
    operations: { cloudAction: () => undefined, camera: () => undefined, command: () => undefined, controls: () => undefined, terminal: () => undefined, files: () => undefined },
    pages: { asset: () => undefined, oidc: () => undefined },
    logs: { machine: () => null, machineLog: () => '', cloudAccounts: () => ({ providers: [], accounts: [] }), cloudLog: () => '', cloudFailure: () => { throw new Error('unused'); } },
  }));
}
const get = (http: ReturnType<typeof build>, url: string, cookie?: string, requestHost = host) =>
  http.app.inject({ method: 'GET', url, headers: { host: requestHost, ...(cookie ? { cookie } : {}) } });

test('socle HTTP : en-têtes de sécurité, refus d’hôte et format d’erreur du POC', async () => {
  const http = build();
  await http.ready;
  const session = await get(http, '/api/session');
  assert.equal(session.statusCode, 200);
  assert.equal(session.headers['cache-control'], 'no-store');
  assert.equal(session.headers['x-content-type-options'], 'nosniff');
  assert.equal(session.headers['referrer-policy'], 'no-referrer');
  assert.match(String(session.headers['content-security-policy']), /frame-ancestors 'none'/);
  assert.match(String(session.headers['content-type']), /^application\/json; charset=utf-8/);
  assert.deepEqual(session.json(), { installed: true, authenticated: false, username: null });
  const wrongHost = await get(http, '/api/session', undefined, 'evil.test');
  assert.equal(wrongHost.statusCode, 421);
  assert.deepEqual(wrongHost.json(), { error: 'host' });
  assert.equal(wrongHost.headers['cache-control'], 'no-store', 'en-têtes posés même en refus');
  assert.deepEqual((await get(http, '/api/session', 'observer')).json(), { installed: true, authenticated: true, username: 'lecture', role: 'observer' });
  await http.close();
});

test('socle HTTP : garde administrateur et erreur interne sans détail', async () => {
  const http = build(() => { throw new Error('secret-path /var/lib/fabcore'); });
  await http.ready;
  assert.deepEqual((await get(http, '/api/diagnostics')).json(), { error: 'sign-in' });
  assert.equal((await get(http, '/api/diagnostics')).statusCode, 401);
  const observer = await get(http, '/api/diagnostics', 'observer');
  assert.equal(observer.statusCode, 403);
  assert.deepEqual(observer.json(), { error: 'forbidden' });
  const failed = await get(http, '/api/diagnostics', 'admin');
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(failed.json(), { error: 'internal' }, 'aucun message interne exposé');
  assert.equal(failures, 1, 'erreur interne signalée au diagnostic');
  await http.close();
});

test('socle HTTP : le diagnostic conserve tout le contenu produit et la liste du parc', async () => {
  const http = build(() => ({ events: [{ area: 'server', code: 'started' }], counters: { mqtt: 2 } }));
  await http.ready;
  assert.deepEqual((await get(http, '/api/diagnostics', 'admin')).json(), {
    events: [{ area: 'server', code: 'started' }], counters: { mqtt: 2 }, fleet: [{ id: 'm1', name: 'P2S' }],
  });
  await http.close();
});

test('socle HTTP : chaîne de requête refusée hors routes prévues, repli et mode brut', async () => {
  const fallbacks: string[] = [];
  let failures = 0;
  const http = createHttpApp({ allowedHost: host, origin: 'http://fabcore.test', limit: () => true, viewer, onFailure: () => { failures += 1; },
    fallback: (request, response) => { fallbacks.push(`${request.method} ${request.url}`); response.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' }); response.end('{"error":"missing"}'); } }, [
    (app, guards) => {
      app.route({ method: 'POST', url: '/flux', config: { query: true }, onRequest: guards.raw(async (request, response) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk as Buffer);
        response.writeHead(201, { 'Content-Type': 'text/plain' });
        response.end(`${Buffer.concat(chunks).length} ${request.url}`);
      }, request => guards.admin(request)), handler: async () => undefined });
      app.get('/casse', { onRequest: guards.raw(() => { throw new Error('/var/lib/secret'); }) }, async () => undefined);
    },
  ]);
  await http.ready;
  assert.deepEqual([(await get(http, '/casse?x=1')).statusCode, (await get(http, '/casse?x=1')).json()], [404, { error: 'missing' }], 'requête non prévue : 404 comme le POC');
  const unknown = await http.app.inject({ method: 'POST', url: '/inconnue', headers: { host, 'content-type': 'application/json' }, payload: '{' });
  assert.equal(unknown.statusCode, 405, 'repli avant lecture du corps invalide');
  assert.equal(unknown.headers['cache-control'], 'no-store', 'en-têtes posés sur le repli');
  assert.deepEqual(fallbacks, ['POST /inconnue']);
  const denied = await http.app.inject({ method: 'POST', url: '/flux?name=a', headers: { host, cookie: 'observer', 'content-type': 'application/octet-stream' }, payload: 'G28' });
  assert.deepEqual([denied.statusCode, denied.json()], [403, { error: 'forbidden' }], 'garde appliquée avant le gestionnaire brut');
  const streamed = await http.app.inject({ method: 'POST', url: '/flux?name=a', headers: { host, cookie: 'admin', 'content-type': 'application/octet-stream' }, payload: Buffer.alloc(70_000) });
  assert.deepEqual([streamed.statusCode, streamed.body], [201, '70000 /flux?name=a'], 'corps brut intact, au-delà de la limite JSON');
  assert.equal(streamed.headers['x-content-type-options'], 'nosniff');
  const broken = await get(http, '/casse');
  assert.deepEqual([broken.statusCode, broken.json()], [500, { error: 'internal' }], 'erreur interne sans détail');
  assert.equal(failures, 1);
  await http.close();
});

test('OpenAPI : servi aux sessions valides et identique au document versionné', async () => {
  const http = build();
  await http.ready;
  assert.equal((await get(http, '/api/openapi.json')).statusCode, 401);
  const served = (await get(http, '/api/openapi.json', 'observer')).json() as { paths: Record<string, unknown> };
  assert.ok(['/api/session', '/api/diagnostics', '/api/machines'].every(path => path in served.paths));
  assert.equal('/api/openapi.json' in served.paths, false, 'route interne masquée');
  await http.close();
  const document = await openApiDocument() as { openapi: string; components: { schemas: Record<string, unknown> } };
  assert.equal(document.openapi, '3.1.0');
  assert.ok(document.components.schemas.ErrorBody);
});
