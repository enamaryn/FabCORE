import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../src/api.ts';

test('React API : droits expirés signalés, aucune répétition automatique des écritures', async () => {
  let calls = 0, revoked = 0;
  const api = createApi(async (url, options) => {
    calls++; assert.equal(url, '/api/login'); assert.equal(options?.redirect, 'error');
    assert.equal(options?.credentials, 'same-origin'); assert.equal(options?.method, 'POST');
    return Response.json({ error: 'credentials' }, { status: 401 });
  }, () => revoked++);
  await assert.rejects(api.login('atelier', 'dummy-password'), error => error instanceof ApiError && error.code === 'credentials');
  assert.equal(calls, 1); assert.equal(revoked, 1);
  const offline = createApi(async () => { calls++; throw new Error('lost'); });
  await assert.rejects(offline.logout(), /lost/); assert.equal(calls, 2);
});
test('React API : réponses malformées refusées et annulation transmise au transport', async () => {
  const controller = new AbortController(); controller.abort();
  const api = createApi((_url, options) => { assert.equal(options?.signal?.aborted, true); return Promise.resolve(Response.json({ machines: [{ id: 'one', name: 'A', kind: 'bambu', status: 'invented' }] })); });
  await assert.rejects(api.fleet(controller.signal), error => error instanceof ApiError && error.code === 'response');
  const session = createApi(async () => Response.json({ installed: true, authenticated: true, username: 'A', role: 'operator' }));
  await assert.rejects(session.session(), error => error instanceof ApiError && error.code === 'response');
});
