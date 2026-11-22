import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPrusaLinkServices, type PrusaLinkFetch, type PrusaLinkPorts } from '../src/index.ts';

const machine = { origin: 'http://192.168.1.41', apiKey: 'prusa-test-key' };
const ports: PrusaLinkPorts = {
  readResponse: response => response.json() as Promise<unknown>,
  validOrigin: origin => origin.startsWith('http://192.168.') ? origin : null,
  filePath: path => typeof path === 'string' && /^[a-zA-Z0-9_/-]+[.]gcode$/.test(path) ? path : null,
  encodePath: path => path.split('/').map(encodeURIComponent).join('/'),
};
const api = createPrusaLinkServices(ports);
const replies = (routes: Record<string, Response | ((method: string) => Response)>, calls: string[] = []): PrusaLinkFetch => async (url, options) => {
  const method = options.method ?? 'GET';
  calls.push(`${method} ${new URL(url).pathname}`);
  assert.equal(options.redirect, 'error');
  assert.equal((options.headers as Record<string, string>)['X-Api-Key'], machine.apiKey);
  const route = routes[new URL(url).pathname];
  if (!route) throw new Error('unexpected ' + url);
  return typeof route === 'function' ? route(method) : route.clone();
};

test('PrusaLink typé : statut, détails du fichier facultatifs et refus d’accès', async () => {
  const printing = await api.readPrusaLink(machine, { fetcher: replies({
    '/api/v1/status': Response.json({ printer: { state: 'PRINTING', temp_nozzle: 215.5, temp_bed: 60 }, job: { progress: 33.4 } }),
    '/api/v1/job': Response.json({ file: { display_name: 'Benchy.gcode' } }),
  }) });
  assert.deepEqual(printing, { status: 'printing', issue: null, nozzle: 215.5, bed: 60, progress: 33, file: 'Benchy.gcode' });
  const noDetails = await api.readPrusaLink(machine, { fetcher: replies({
    '/api/v1/status': Response.json({ printer: { state: 'PAUSED' }, job: { progress: 'x' } }),
    '/api/v1/job': () => { throw new Error('reset'); },
  }) });
  assert.deepEqual(noDetails, { status: 'paused', issue: null, nozzle: null, bed: null, progress: 0, file: '' });
  assert.equal((await api.readPrusaLink(machine, { fetcher: replies({ '/api/v1/status': new Response(null, { status: 401 }) }) })).issue, 'prusalink-access');
  assert.equal((await api.readPrusaLink(machine, { fetcher: replies({ '/api/v1/status': Response.json({ printer: { state: 'ATTENTION' } }) }) })).issue, 'prusalink-printer-error');
  assert.equal((await api.readPrusaLink(machine, { fetcher: replies({ '/api/v1/status': Response.json({ printer: { state: 'NEW' } }) }) })).issue, 'prusalink-response');
});

test('PrusaLink typé : commande ciblée sur la tâche courante, sans renvoi', async () => {
  const calls: string[] = [];
  let status = 204;
  const ops = api.createPrusaOperations(replies({
    '/api/v1/job': Response.json({ id: 12 }),
    '/api/v1/job/12': () => new Response(null, { status }),
    '/api/v1/job/12/pause': () => new Response(null, { status }),
  }, calls));
  assert.equal(await ops.command(machine, 'stop'), true);
  assert.equal(await ops.command(machine, 'pause'), true);
  assert.deepEqual(calls, ['GET /api/v1/job', 'DELETE /api/v1/job/12', 'GET /api/v1/job', 'PUT /api/v1/job/12/pause']);
  status = 500;
  await assert.rejects(ops.command(machine, 'pause'), /command-unconfirmed/);
  assert.equal(calls.filter(call => call.startsWith('PUT')).length, 2, 'aucun renvoi après une erreur serveur');
  assert.equal(await ops.command(machine, 'home'), false);
  const idle = api.createPrusaOperations(replies({ '/api/v1/job': Response.json({}) }, calls));
  const before = calls.length;
  assert.equal(await idle.command(machine, 'pause'), false, 'pas de tâche, pas de commande');
  assert.equal(calls.length, before + 1);
});

test('PrusaLink typé : inventaire des stockages disponibles et téléchargement limité à la machine', async () => {
  const ops = api.createPrusaOperations(replies({
    '/api/v1/storage': Response.json({ storage_list: [{ path: '/usb/', available: true }, { path: '/local', available: false }, { path: '../x' }] }),
    '/api/v1/files/usb/': Response.json({ children: [{ name: 'cube', type: 'PRINT_FILE', size: 7, m_timestamp: 3 }, { name: 'parts', type: 'FOLDER' }, { name: 'a/b', type: 'PRINT_FILE' }] }),
    '/api/v1/files/usb/parts/': Response.json({ children: [] }),
    '/api/v1/files/usb/cube': Response.json({ refs: { download: 'http://evil.example/usb/cube' } }),
  }));
  assert.deepEqual(await ops.files.list(machine), [], 'les noms sans extension G-code reconnue sont ignorés');
  await assert.rejects(ops.files.download(machine, 'usb/cube'), /invalid-download/, 'jamais de téléchargement hors de la machine');
});
