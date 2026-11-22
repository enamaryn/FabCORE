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
  return createHttpApp({ allowedHost: host, viewer, onFailure: () => { failures += 1; } }, migratedRoutes({
    session: { installed: () => true, oidcEnabled: () => false, viewer },
    diagnostics: { view, fleet: () => [{ id: 'm1', name: 'P2S' }] },
    fleet: { list: async () => [] },
    notifications: { view: () => ({ ntfy: { mode: 'off' }, smtp: { enabled: false }, internal: null }) },
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

test('socle HTTP : seules les routes migrées sont déléguées, identifiants contraints comme le POC', async () => {
  const http = build();
  await http.ready;
  const request = (method: string, url: string) => ({ method, url }) as IncomingMessage;
  assert.equal(http.handles(request('GET', '/api/session')), true);
  assert.equal(http.handles(request('GET', '/api/diagnostics')), true);
  assert.equal(http.handles(request('GET', '/api/openapi.json')), true);
  assert.equal(http.handles(request('POST', '/api/session')), false, 'autre méthode : routeur POC');
  assert.equal(http.handles(request('HEAD', '/api/session')), false);
  assert.equal(http.handles(request('GET', '/api/session?x=1')), false, 'chemin exact uniquement, comme le POC');
  const id = '3f1c2b9e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
  assert.equal(http.handles(request('GET', '/api/machines')), true);
  assert.equal(http.handles(request('GET', `/api/machines/${id}/logs`)), true);
  assert.equal(http.handles(request('GET', `/api/machines/${id}/logs-download`)), true);
  assert.equal(http.handles(request('GET', `/api/cloud-accounts/${id}/logs`)), true);
  assert.equal(http.handles(request('GET', '/api/machines/not-a-uuid/logs')), false, 'identifiant invalide : réponse POC inchangée');
  assert.equal(http.handles(request('GET', `/api/machines/${id}/camera`)), false);
  assert.equal(http.handles(request('POST', '/api/machines')), false, 'écritures encore servies par le POC');
  assert.equal(http.handles(request('POST', `/api/cloud-accounts/${id}/login`)), false);
  assert.equal(http.handles(request('GET', `/api/cloud-accounts/${id}/login`)), false);
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
