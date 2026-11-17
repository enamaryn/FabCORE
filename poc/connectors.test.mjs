import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectorCatalog, createConnectorRegistry } from './connectors.mjs';
import { readPrusaLink } from './prusalink.mjs';

test('le registre charge un connecteur à la demande, une fois par instance', async () => {
  const loads = [];
  const closed = [];
  const registry = createConnectorRegistry({}, kind => ({
    load() {
      loads.push(kind);
      return { close: () => closed.push(kind) };
    }
  }));
  assert.deepEqual(loads, []);
  const [first, second] = await Promise.all([registry.get('octoprint'), registry.get('octoprint')]);
  assert.equal(first, second);
  assert.deepEqual(loads, ['octoprint']);
  await registry.get('prusalink');
  assert.deepEqual(loads, ['octoprint', 'prusalink']);
  registry.close();
  assert.deepEqual(closed, loads);
});

test('PrusaLink lit le statut local et le fichier actif sans suivre de redirection', async () => {
  const origin = 'http://192.168.1.34';
  const visited = [];
  const result = await readPrusaLink({ origin, apiKey: 'test-key' }, { fetcher: async (url, request) => {
    assert.equal(request.headers['X-Api-Key'], 'test-key');
    assert.equal(request.redirect, 'error');
    assert.equal(request.method, 'GET');
    visited.push(url);
    return url.endsWith('/status')
      ? Response.json({ printer: { state: 'PRINTING', temp_nozzle: 210.4, temp_bed: 60.5 }, job: { id: 7, progress: 63.6 } })
      : Response.json({ file: { display_name: 'support.bgcode' } });
  } });
  assert.deepEqual(result, { status: 'printing', issue: null, nozzle: 210.4, bed: 60.5, progress: 64, file: 'support.bgcode' });
  assert.deepEqual(visited, [origin + '/api/v1/status', origin + '/api/v1/job']);
  assert.equal(connectorCatalog.prusalink.temperatures, true);
  assert.equal(connectorCatalog.prusalink.commands, false);
  const denied = await readPrusaLink({ origin, apiKey: 'invalid' }, { fetcher: async () => new Response(null, { status: 401 }) });
  assert.equal(denied.issue, 'prusalink-access');
});
