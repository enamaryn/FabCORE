import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { createMoonrakerServices } from '../src/index.ts';
import type { HttpFilePorts } from '../../../packages/connector-sdk/src/index.ts';
import type { MoonrakerFetch } from '../src/types.ts';

const one = { origin: 'http://192.168.1.176:7125', apiKey: 'first-test-key' };
const two = { origin: 'http://192.168.1.176:7126', apiKey: 'second-test-key' };
function ports(): HttpFilePorts {
  return {
    readResponse: response => response.json() as Promise<unknown>,
    validOrigin: origin => [one.origin, two.origin].includes(origin) ? origin : null,
    filePath: path => typeof path === 'string' && /^[a-zA-Z0-9_/-]+[.]gcode$/.test(path) && !path.includes('..') ? path : null,
    encodePath: path => path.split('/').map(encodeURIComponent).join('/'),
    multipart: () => { throw new Error('unexpected upload'); },
  };
}

test('Moonraker typé : deux ports de la même IP gardent leurs clés, états et positions séparés', async () => {
  const api = createMoonrakerServices(ports()), calls: string[] = [];
  const fetcher: MoonrakerFetch = (url, options) => {
    calls.push(url);
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    const first = url.startsWith(one.origin + '/');
    assert.deepEqual(options.headers, { 'X-Api-Key': first ? one.apiKey : two.apiKey });
    assert.equal(new URL(url).pathname + new URL(url).search, '/printer/objects/query?webhooks&print_stats&virtual_sdcard&extruder&heater_bed');
    return Promise.resolve(Response.json({ result: { status: {
      webhooks: { state: 'ready' }, print_stats: { state: first ? 'printing' : 'paused', filename: first ? 'cube.gcode' : 'other.gcode' },
      virtual_sdcard: { progress: first ? 0.25 : 0.75, file_position: first ? 42 : 99 }, extruder: { temperature: first ? 200.54 : 21 }, heater_bed: { temperature: first ? 60 : null },
    } } }));
  };
  const [a, b] = await Promise.all([api.readMoonraker(one, fetcher), api.readMoonraker(two, fetcher)]);
  assert.equal(a.status, 'printing'); assert.equal(a.progress, 25); assert.equal(a.nozzle, 200.5); assert.equal(a.filePosition, 42);
  assert.equal(b.status, 'paused'); assert.equal(b.progress, 75); assert.equal(b.bed, null); assert.equal(b.filePath, 'other.gcode');
  assert.equal(calls.length, 2);
});

test('Moonraker typé : refus distinct des réponses perdues, commandes bornées et aucun rejeu', async () => {
  const api = createMoonrakerServices(ports()); let calls = 0;
  const failIfCalled: MoonrakerFetch = () => { throw new Error('must not contact the network'); };
  assert.equal(await api.commandMoonraker(one, 'unsupported', failIfCalled), false);
  assert.equal(await api.commandMoonraker({ origin: 'http://8.8.8.8' }, 'pause', failIfCalled), false);
  for (const [action, endpoint] of [['pause', 'pause'], ['resume', 'resume'], ['stop', 'cancel']]) {
    const refused = await api.commandMoonraker(one, action!, (url, options) => {
      calls++; assert.equal(url, one.origin + '/printer/print/' + endpoint);
      assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
      return Promise.resolve(new Response(null, { status: 403 }));
    });
    assert.equal(refused, false);
  }
  assert.equal(calls, 3);
  const before = calls;
  await assert.rejects(api.commandMoonraker(one, 'stop', () => { calls++; return Promise.resolve(new Response(null, { status: 502 })); }), /outcome unknown/);
  assert.equal(calls, before + 1);
  await assert.rejects(api.commandMoonraker(one, 'stop', () => Promise.resolve(Response.json({ result: 'pending' }))), /outcome unknown/);
});

test('Moonraker typé : stockage natif, multipart partagé et chemin retourné pour le lancement', async () => {
  const dependencies = ports(); let uploaded = false;
  dependencies.multipart = (field, name, source, size, extra) => {
    assert.equal(field, 'file'); assert.equal(name, 'part.gcode'); assert.equal(size, 6);
    assert.deepEqual(extra, { root: 'gcodes' }); assert.ok(source[Symbol.asyncIterator]);
    uploaded = true;
    return { body: new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } }), headers: { 'Content-Type': 'multipart/form-data; boundary=test', 'Content-Length': '6' } };
  };
  const api = createMoonrakerServices(dependencies), calls: string[] = [];
  const files = api.createMoonrakerFiles((url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error'); assert.equal((options.headers as Record<string, string>)['X-Api-Key'], one.apiKey);
    if (url.endsWith('/list?root=gcodes')) return Promise.resolve(Response.json({ result: [{ path: 'folder/demo.gcode', size: 12, modified: 1700000000 }, { path: '../bad.gcode' }, { path: 'other.gcode', size: 'unknown' }] }));
    if (url.endsWith('/upload')) { assert.equal(options.duplex, 'half'); assert.equal(options.method, 'POST'); return Promise.resolve(Response.json({ result: { item: { path: 'folder/part.gcode' } } })); }
    if (url.includes('/start?')) { assert.equal(options.method, 'POST'); return Promise.resolve(Response.json({ result: 'ok' })); }
    return Promise.resolve(new Response('G1 X1\n'));
  });
  assert.deepEqual(await files.list(one), [{ path: 'folder/demo.gcode', size: 12, modified: 1700000000000 }, { path: 'other.gcode', size: null, modified: null }]);
  const stored = await files.upload(one, 'part.gcode', Readable.from(['G1 X1\n']), 6);
  assert.equal(uploaded, true); assert.equal(stored, 'folder/part.gcode');
  assert.equal(calls.some(url => url.includes('/start?')), false, 'un envoi ne lance rien');
  assert.equal(await files.start(one, stored!), true);
  assert.ok(calls.includes(one.origin + '/printer/print/start?filename=folder%2Fpart.gcode'));
  const controller = new AbortController(); controller.abort();
  const download = api.createMoonrakerFiles((_url, options) => { assert.equal(options.signal, controller.signal); return Promise.resolve(new Response('file')); });
  assert.equal(await (await download.download(one, 'folder/demo.gcode', controller.signal)).text(), 'file');
});

test('Moonraker typé : terminal exécuté, seules les réponses après le dernier script sont bornées', async () => {
  const api = createMoonrakerServices(ports()); let posts = 0;
  const result = await api.sendMoonrakerGcode(one, 'M105', (url, options) => {
    if (url.endsWith('/script')) { posts++; assert.equal(options.body, JSON.stringify({ script: 'M105' })); return Promise.resolve(Response.json({ result: 'ok' })); }
    return Promise.resolve(Response.json({ result: { gcode_store: [
      { type: 'command', message: 'M105' }, { type: 'response', message: 'old' },
      { type: 'command', message: 'M105' }, ...Array.from({ length: 40 }, () => ({ type: 'response', message: 'x'.repeat(600) })),
    ] } }));
  });
  assert.equal(result.outcome, 'executed'); assert.equal(posts, 1);
  // 40 réponses de 600 caractères : toutes conservées en entier (HELP, listes de macros).
  if (result.outcome === 'executed') { assert.equal(result.responses?.length, 40); assert.equal(result.responses?.[0]?.length, 600); }
  const huge = await api.sendMoonrakerGcode(one, 'HELP', url => url.endsWith('/script') ? Promise.resolve(Response.json({ result: 'ok' })) : Promise.resolve(Response.json({ result: { gcode_store: [
    { type: 'command', message: 'HELP' }, ...Array.from({ length: 150 }, () => ({ type: 'response', message: 'y'.repeat(9000) })),
  ] } })));
  if (huge.outcome === 'executed') {
    assert.equal(huge.responses?.[0]?.length, 8000, 'message plafonné à 8 000 caractères');
    assert.ok((huge.responses ?? []).reduce((total, message) => total + message.length, 0) <= 64000, 'total plafonné');
  }
  const withoutStore = await api.sendMoonrakerGcode(one, 'M105', url => url.endsWith('/script') ? Promise.resolve(Response.json({ result: 'ok' })) : Promise.reject(new Error('lost read')));
  assert.deepEqual(withoutStore, { outcome: 'executed', responses: null });
});

test('Moonraker typé : JSON illisible, réseau perdu et Klippy indisponible restent distingués', async () => {
  const api = createMoonrakerServices(ports());
  const invalid = await api.readMoonraker(one, () => Promise.resolve(new Response('not json')));
  assert.equal(invalid.status, 'error'); assert.equal(invalid.issue, 'moonraker');
  const offline = await api.readMoonraker(one, () => Promise.reject(new Error('lost')));
  assert.equal(offline.status, 'offline'); assert.equal(offline.issue, 'connection');
  const startup = await api.readMoonraker(one, () => Promise.resolve(Response.json({ result: { status: { webhooks: { state: 'startup' } } } })));
  assert.equal(startup.status, 'connecting'); assert.equal(startup.issue, 'klippy');
});

test('Moonraker : flux caméra déclaré, MJPEG d’abord, même hôte uniquement', async () => {
  // Comme en production : toute origine HTTP(S) privée est valide, le contrôle de même hôte fait le reste.
  const api = createMoonrakerServices({ ...ports(), validOrigin: origin => /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ? origin : null });
  const list = (webcams: unknown[]): MoonrakerFetch => async (url, options) => {
    assert.equal(new URL(url).pathname, '/server/webcams/list');
    assert.equal(options.redirect, 'error');
    return Response.json({ result: { webcams } });
  };
  const url = await api.moonrakerWebcam(one, list([
    { name: 'webrtc', enabled: true, service: 'webrtc-camerastreamer', stream_url: '/webcam2/webrtc' },
    { name: 'off', enabled: false, service: 'mjpegstreamer', stream_url: '/off/?action=stream' },
    { name: 'cam', enabled: true, service: 'mjpegstreamer-adaptive', stream_url: '/webcam/?action=stream' },
  ]));
  assert.equal(url?.href, 'http://192.168.1.176/webcam/?action=stream', 'URL relative servie par l’interface web du même hôte');
  for (const stream_url of ['http://192.168.1.99/webcam/?action=stream', 'http://user:pw@192.168.1.176/cam', 'https://192.168.1.176/cam', 'file:///etc/passwd']) {
    assert.equal(await api.moonrakerWebcam(one, list([{ enabled: true, service: 'mjpegstreamer', stream_url }])), null, `refusé : ${stream_url}`);
  }
  assert.equal(await api.moonrakerWebcam(one, async () => new Response('', { status: 404 })), null);
});

test('Moonraker typé : message Klipper remonté en texte court pour l’arrêt et l’erreur d’impression', async () => {
  const api = createMoonrakerServices(ports());
  const reply = (status: unknown) => () => Promise.resolve(Response.json({ result: { status } }));
  const shutdown = await api.readMoonraker(one, reply({ webhooks: { state: 'shutdown', state_message: 'Shutdown due to M112 command\nOnce the underlying issue is corrected, use the "FIRMWARE_RESTART" command' } }));
  assert.equal(shutdown.issue, 'moonraker-shutdown');
  assert.equal(shutdown.nativeMessage, 'Shutdown due to M112 command Once the underlying issue is corrected, use the "FIRMWARE_RESTART" command');
  const failed = await api.readMoonraker(one, reply({ webhooks: { state: 'ready' }, print_stats: { state: 'error', filename: 'a.gcode', message: 'Unknown command:"PRINT_START"' } }));
  assert.equal(failed.status, 'error'); assert.equal(failed.nativeMessage, 'Unknown command:"PRINT_START"');
  const long = await api.readMoonraker(one, reply({ webhooks: { state: 'error', state_message: 'x'.repeat(1000) } }));
  assert.equal(long.nativeMessage?.length, 300);
  const ready = await api.readMoonraker(one, reply({ webhooks: { state: 'ready' }, print_stats: { state: 'standby', message: 'old' } }));
  assert.equal(ready.nativeMessage, undefined, 'aucun message hors erreur');
  const odd = await api.readMoonraker(one, reply({ webhooks: { state: 'shutdown', state_message: { html: '<b>' } } }));
  assert.equal(odd.nativeMessage, undefined);
});
