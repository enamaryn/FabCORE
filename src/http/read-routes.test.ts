import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { test } from 'node:test';
import { createHttpApp, type Viewer } from './app.ts';
import { HttpError } from './errors.ts';
import { migratedRoutes, type RouteDependencies } from './routes/index.ts';

const host = 'fabcore.test';
const id = '3f1c2b9e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const viewers: Record<string, Viewer> = {
  admin: { session: 'session-admin', username: 'atelier', role: 'admin' },
  observer: { session: 'session-observer', username: 'lecture', role: 'observer' },
};
const viewer = (request: IncomingMessage) => viewers[String(request.headers.cookie ?? '')] ?? null;
class CloudError extends Error { status = 404; }
function build(overrides: Partial<RouteDependencies> = {}) {
  const sessions: string[] = [];
  const dependencies: RouteDependencies = {
    accounts: { installed: () => true, setup: async () => { throw new Error('unused'); }, login: async () => { throw new Error('unused'); }, logout: () => ({ body: { authenticated: false as const }, cookie: '' }), addObserver: async () => ({ username: 'x' }) },
    session: { installed: () => true, oidcEnabled: () => false, viewer },
    diagnostics: { view: () => ({}), fleet: () => [] },
    machines: { write: async () => null, spool: () => ({ manualSpool: null }), networks: () => ({ networks: [] }), discover: async () => null },
    fleet: { list: async current => { sessions.push(current.session); return [{ id, name: 'P2S', kind: 'bambu', status: 'printing', cameraOpen: false, nozzle: null, filaments: [{ slots: [] }] }]; } },
    notifications: { view: () => ({ ntfy: { mode: 'external', url: 'https://ntfy.example.test', topic: 'fabcore' }, smtp: { enabled: false }, internal: null }), save: () => { throw new Error('unused'); }, test: async () => ({ accepted: true as const }) },
    operations: { cloudAction: () => undefined, camera: () => undefined, command: () => undefined, controls: () => undefined, terminal: () => undefined, files: () => undefined },
    pages: { asset: () => undefined, oidc: () => undefined },
    logs: {
      machine: machineId => machineId === id ? { id, name: 'P2S', kind: 'bambu' } : null,
      machineLog: () => '{"event":"a"}\n{"event":"b"}\n',
      cloudAccounts: () => ({ providers: [{ id: 'bambu' }], accounts: [{ id, name: 'Atelier', status: 'connected' }] }),
      cloudLog: accountId => { if (accountId !== id) throw new CloudError('cloud-missing'); return '{"event":"c"}\n'; },
      cloudFailure: failure => failure instanceof CloudError ? new HttpError(failure.status, failure.message) : new HttpError(500, 'cloud-storage'),
    },
    ...overrides,
  };
  return { http: createHttpApp({ allowedHost: host, origin: 'http://fabcore.test', limit: () => true, viewer }, migratedRoutes(dependencies)), sessions };
}
const get = (http: ReturnType<typeof build>['http'], url: string, cookie?: string) =>
  http.app.inject({ method: 'GET', url, headers: { host, ...(cookie ? { cookie } : {}) } });

test('parc : session requise, lecture propre à la session et champs du connecteur conservés', async () => {
  const { http, sessions } = build();
  await http.ready;
  assert.deepEqual((await get(http, '/api/machines')).json(), { error: 'sign-in' });
  const fleet = await get(http, '/api/machines', 'observer');
  assert.equal(fleet.statusCode, 200, 'un observateur lit le parc');
  assert.deepEqual(fleet.json(), { machines: [{ id, name: 'P2S', kind: 'bambu', status: 'printing', cameraOpen: false, nozzle: null, filaments: [{ slots: [] }] }] });
  assert.deepEqual(sessions, ['session-observer'], 'flux caméra évalués pour la session qui lit');
  await http.close();
});

test('notifications : administrateur seulement, sans secret ajouté', async () => {
  const { http } = build();
  await http.ready;
  assert.equal((await get(http, '/api/notifications', 'observer')).statusCode, 403);
  assert.deepEqual((await get(http, '/api/notifications', 'admin')).json(), { ntfy: { mode: 'external', url: 'https://ntfy.example.test', topic: 'fabcore' }, smtp: { enabled: false }, internal: null });
  await http.close();
});

test('journaux machine : droits, machine inconnue, lecture JSON, téléchargement et indisponibilité', async () => {
  const { http } = build();
  await http.ready;
  assert.equal((await get(http, `/api/machines/${id}/logs`)).statusCode, 401);
  assert.equal((await get(http, `/api/machines/${id}/logs`, 'observer')).statusCode, 403);
  const missing = await get(http, '/api/machines/00000000-0000-0000-0000-000000000000/logs', 'admin');
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), { error: 'missing' });
  assert.deepEqual((await get(http, `/api/machines/${id}/logs`, 'admin')).json(), { machine: { id, name: 'P2S', kind: 'bambu', mode: 'lan' }, lines: [{ event: 'a' }, { event: 'b' }] });
  const download = await get(http, `/api/machines/${id}/logs-download`, 'admin');
  assert.equal(download.statusCode, 200);
  assert.equal(download.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(download.headers['content-disposition'], `attachment; filename="fabcore-machine-${id}.log"`);
  assert.equal(download.body, '{"event":"a"}\n{"event":"b"}\n');
  await http.close();
  for (const machineLog of [() => { throw new Error('EACCES /var/lib'); }, () => 'pas du json\n']) {
    const broken = build({ logs: { machine: () => ({ id, name: 'P2S' }), machineLog, cloudAccounts: () => ({ providers: [], accounts: [] }), cloudLog: () => '', cloudFailure: () => new HttpError(500, 'cloud-storage') } }).http;
    await broken.ready;
    const failed = await get(broken, `/api/machines/${id}/logs`, 'admin');
    assert.equal(failed.statusCode, 503);
    assert.deepEqual(failed.json(), { error: 'logs-unavailable' }, 'aucun détail système exposé');
    await broken.close();
  }
});

test('comptes cloud : droits, liste, journal, refus connu et stockage illisible', async () => {
  const { http } = build();
  await http.ready;
  assert.equal((await get(http, '/api/cloud-accounts', 'observer')).statusCode, 403);
  assert.deepEqual((await get(http, '/api/cloud-accounts', 'admin')).json(), { providers: [{ id: 'bambu' }], accounts: [{ id, name: 'Atelier', status: 'connected' }] });
  assert.deepEqual((await get(http, `/api/cloud-accounts/${id}/logs`, 'admin')).json(), { lines: [{ event: 'c' }] });
  const unknown = await get(http, '/api/cloud-accounts/00000000-0000-0000-0000-000000000000/logs', 'admin');
  assert.equal(unknown.statusCode, 404);
  assert.deepEqual(unknown.json(), { error: 'cloud-missing' });
  await http.close();
  const corrupt = build({ logs: { machine: () => null, machineLog: () => '', cloudAccounts: () => ({ providers: [], accounts: [] }), cloudLog: () => '{broken\n', cloudFailure: failure => failure instanceof CloudError ? new HttpError(failure.status, failure.message) : new HttpError(500, 'cloud-storage') } }).http;
  await corrupt.ready;
  assert.deepEqual((await get(corrupt, `/api/cloud-accounts/${id}/logs`, 'admin')).json(), { error: 'cloud-storage' });
  await corrupt.close();
});
