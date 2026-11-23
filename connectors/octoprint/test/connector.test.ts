import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HttpFilePorts } from '../../../packages/connector-sdk/src/index.ts';
import { createOctoPrintServices, type OctoPrintFetch } from '../src/index.ts';

const machine = { origin: 'http://192.168.1.40:5000', apiKey: 'octo-test-key' };
const ports: HttpFilePorts = {
  readResponse: response => response.json() as Promise<unknown>,
  validOrigin: origin => origin.startsWith('http://192.168.') ? origin : null,
  filePath: path => typeof path === 'string' && /^[a-zA-Z0-9_/-]+[.]gcode$/.test(path) ? path : null,
  encodePath: path => path.split('/').map(encodeURIComponent).join('/'),
  multipart: () => { throw new Error('unexpected upload'); },
};
const api = createOctoPrintServices(ports);
const replies = (routes: Record<string, Response | (() => Response)>, calls: string[] = []): OctoPrintFetch => async (url, options) => {
  calls.push(`${options.method ?? 'GET'} ${new URL(url).pathname}`);
  assert.equal(options.redirect, 'error');
  assert.equal((options.headers as Record<string, string>)['X-Api-Key'], machine.apiKey);
  const route = routes[new URL(url).pathname];
  if (!route) throw new Error('unexpected ' + url);
  return typeof route === 'function' ? route() : route.clone();
};

test('OctoPrint typé : lecture, position locale uniquement en fabrication et états déconnectés', async () => {
  const printing = await api.readOctoPrint(machine, { fetcher: replies({
    '/api/job': Response.json({ state: 'Printing', progress: { completion: 41.6, filepos: 1200 }, job: { file: { display: 'Cube', path: 'cube.gcode', origin: 'local' } } }),
    '/api/printer': Response.json({ state: { flags: {} }, temperature: { tool0: { actual: 210.04 }, bed: { actual: 60 } } }),
  }) });
  assert.deepEqual(printing, { status: 'printing', issue: null, nozzle: 210, bed: 60, progress: 42, file: 'Cube', filePath: 'cube.gcode', filePosition: 1200 });
  const sd = await api.readOctoPrint(machine, { fetcher: replies({
    '/api/job': Response.json({ state: 'Printing', progress: { filepos: 5 }, job: { file: { name: 'sd.gcode', path: 'sd.gcode', origin: 'sdcard' } } }),
    '/api/printer': Response.json({ temperature: {} }),
  }) });
  assert.equal(sd.filePath, undefined, 'aucune position pour un fichier hors stockage local');
  assert.equal(sd.progress, 0, 'progression inconnue non inventée');
  const calls: string[] = [];
  assert.deepEqual(await api.readOctoPrint(machine, { fetcher: replies({ '/api/job': Response.json({ state: 'Closed' }) }, calls) }),
    { status: 'offline', issue: 'octoprint-disconnected', nozzle: null, bed: null, progress: 0, file: '' });
  assert.deepEqual(calls, ['GET /api/job'], 'pas de lecture imprimante quand OctoPrint est déconnecté');
  assert.equal((await api.readOctoPrint(machine, { fetcher: replies({ '/api/job': new Response(null, { status: 403 }) }) })).issue, 'octoprint-access');
  assert.equal((await api.readOctoPrint(machine, { fetcher: replies({ '/api/job': Response.json({ state: 'Operational' }), '/api/printer': new Response(null, { status: 409 }) }) })).issue, 'octoprint-disconnected');
  assert.equal((await api.readOctoPrint({ ...machine, apiKey: '' })).issue, 'octoprint-access', 'clé absente refusée sans requête');
});

test('OctoPrint typé : commandes et terminal envoyés une fois, erreur serveur laissée inconnue', async () => {
  const bodies: unknown[] = [];
  let status = 204;
  const fetcher: OctoPrintFetch = async (_url, options) => { bodies.push(JSON.parse(String(options.body))); return new Response(null, { status }); };
  assert.equal(await api.commandOctoPrint(machine, 'stop', fetcher), true);
  assert.equal(await api.commandOctoPrint(machine, 'resume', fetcher), true);
  assert.deepEqual(bodies, [{ command: 'cancel' }, { command: 'pause', action: 'resume' }]);
  assert.equal(await api.commandOctoPrint(machine, 'home', fetcher), false);
  assert.equal(bodies.length, 2, 'action hors périmètre refusée sans requête');
  status = 409;
  assert.equal(await api.commandOctoPrint(machine, 'pause', fetcher), false);
  assert.deepEqual(await api.sendOctoPrintGcode(machine, 'M105', fetcher), { outcome: 'rejected', message: 'octoprint-disconnected' });
  status = 503;
  await assert.rejects(api.commandOctoPrint(machine, 'pause', fetcher), /command-unconfirmed/);
  await assert.rejects(api.sendOctoPrintGcode(machine, 'M105', fetcher), /outcome unknown/);
  status = 204;
  assert.deepEqual(await api.sendOctoPrintGcode(machine, 'M105', fetcher), { outcome: 'accepted', responses: null }, 'mise en file seulement, jamais « exécutée »');
  assert.equal(bodies.length, 7, 'une requête par appel, aucun renvoi après une erreur');
});

test('OctoPrint typé : inventaire local récursif limité au G-code', async () => {
  const files = api.createOctoPrintFiles(replies({ '/api/files/local': Response.json({ files: [
    { type: 'machinecode', path: 'cube.gcode', size: 10, date: 2 },
    { type: 'folder', children: [{ type: 'machinecode', path: 'parts/gear.gcode' }, { type: 'model', path: 'parts/gear.stl' }] },
    { type: 'machinecode', path: '../escape.gcode' },
  ] }) }));
  assert.deepEqual(await files.list(machine), [
    { path: 'cube.gcode', size: 10, modified: 2000 },
    { path: 'parts/gear.gcode', size: null, modified: null },
  ]);
});

test('OctoPrint typé : flux caméra des réglages, désactivé ou autre hôte refusé', async () => {
  const settings = (webcam: unknown) => replies({ '/api/settings': Response.json({ webcam }) });
  assert.equal((await api.octoPrintWebcam(machine, settings({ webcamEnabled: true, streamUrl: '/webcam/?action=stream' })))?.href, 'http://192.168.1.40:5000/webcam/?action=stream');
  assert.equal((await api.octoPrintWebcam(machine, settings({ webcamEnabled: true, streamUrl: 'http://192.168.1.40:8080/?action=stream' })))?.href, 'http://192.168.1.40:8080/?action=stream', 'autre port du même hôte accepté');
  assert.equal(await api.octoPrintWebcam(machine, settings({ webcamEnabled: false, streamUrl: '/webcam/?action=stream' })), null);
  assert.equal(await api.octoPrintWebcam(machine, settings({ webcamEnabled: true, streamUrl: 'http://evil.example/cam' })), null);
  assert.equal(await api.octoPrintWebcam({ ...machine, apiKey: '' }), null, 'clé absente : aucune requête');
});
