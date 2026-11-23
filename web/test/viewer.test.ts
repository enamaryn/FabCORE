// Visualiseur React (MIG-06.2.2) : routes, calculs de rendu et lecture annulable, sans navigateur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGcode } from '../../poc/gcode.mjs';
import { localViewerHref, viewerHref } from '../src/files.ts';
import { parseRoute } from '../src/route.ts';
import { advance, draw, fit, initialCamera, orbit, project, zoom } from '../src/viewer/render.ts';
import { loadGcode, ViewerLoadError } from '../src/viewer/load.ts';

const id = '11111111-1111-4111-8111-111111111111';
const gcode = 'G90\nG1 Z0.2\nG1 X0 Y0\nG1 X10 Y0 E1\nG1 X10 Y10 E2\nG1 Z0.4\nG1 X0 Y10 E3\nG0 X0 Y0\n';

test('routes : fichier exact, suivi, local ; traversées et chemins invalides refusés', () => {
  assert.deepEqual(parseRoute(viewerHref(id, 'usb/piece #1 & 2.gcode')), { kind: 'viewer', id, source: { kind: 'machine', path: 'usb/piece #1 & 2.gcode', follow: false } }, 'caractères spéciaux encodés');
  assert.equal(parseRoute(viewerHref(id, 'usb/pièce.gcode')), null, 'mêmes règles que la liste de fichiers (ASCII imprimable)');
  assert.deepEqual(parseRoute(viewerHref(id, 'usb/piece 1.gcode', true)), { kind: 'viewer', id, source: { kind: 'machine', path: 'usb/piece 1.gcode', follow: true } });
  assert.deepEqual(parseRoute(localViewerHref(id)), { kind: 'viewer', id, source: { kind: 'local' } });
  for (const hash of [viewerHref(id, '../secret.gcode'), viewerHref(id, 'a/./b.gcode'), viewerHref(id, 'piece.txt'), `#machine/${id}/view/%E0%A4%A`, `#machine/${id}/view/`, '#machine/pas-un-id/view/a.gcode', `#machine/${id}/view/a.gcode/autre`])
    assert.equal(parseRoute(hash), null, hash);
});

test('rendu : cadrage 2D/3D, projection, zoom borné et rotation conservant le zoom', () => {
  const result = parseGcode(gcode);
  const view = fit(result, initialCamera(), 200, 200);
  assert.ok(view.scale > 10 && view.scale < 20);
  assert.deepEqual(project(initialCamera(), 3, 4, 9), [3, 4], '2D : Z ignoré');
  const camera3d = { ...initialCamera(), mode: '3d' as const };
  assert.notDeepEqual(project(camera3d, 3, 4, 9), [3, 4]);
  assert.equal(zoom(view, 1e9, 100, 100).scale, 2000);
  assert.equal(zoom(view, 1e-9, 100, 100).scale, 0.05);
  const centered = zoom(view, 2, 100, 100);
  assert.equal(centered.x, 100 - (100 - view.x) * 2, 'point sous le curseur conservé');
  const zoomed = { ...fit(result, camera3d, 200, 200), scale: fit(result, camera3d, 200, 200).scale * 3 };
  const turned = orbit(result, camera3d, zoomed, 50, 1000, 200, 200);
  assert.equal(turned.camera.pitch, 1.5, 'inclinaison bornée');
  assert.ok(Math.abs(turned.view.scale / fit(result, turned.camera, 200, 200).scale - 3) < 1e-9, 'zoom relatif conservé');
});

test('simulation : avance à 60 mm/s × vitesse, pas borné à 100 ms, arrêt en fin de fichier', () => {
  const result = parseGcode(gcode);
  assert.equal(advance(result, 0, 0, 10), 0);
  const step = advance(result, 0, 0.01, 1);
  assert.ok(step > 0 && step < 1, '0,6 mm sur un premier segment plus long');
  assert.equal(advance(result, 0, 5, 1), advance(result, 0, 0.1, 1), 'pas de temps borné');
  assert.equal(advance(result, 0, 0.1, 100000), result.types.length);
});

test('dessin : couche, déplacements, repère ; couche inexistante sans erreur', () => {
  const result = parseGcode(gcode);
  const calls: string[] = [];
  const context = new Proxy({}, { get: (_target, name) => typeof name === 'string' && ['globalAlpha', 'strokeStyle', 'lineWidth', 'fillStyle', 'lineCap', 'lineJoin'].includes(name) ? undefined : (...args: unknown[]) => { calls.push(String(name)); return args; }, set: () => true }) as unknown as CanvasRenderingContext2D;
  const palette = { dim: 'd', accent: 'a', travel: 't', marker: 'm', text: 'x' };
  draw(context, result, initialCamera(), fit(result, initialCamera(), 100, 100), { layer: 0, previous: true, travel: true, cursor: 1.5, printed: null }, palette, 100, 100);
  assert.ok(calls.includes('arc'), 'repère de l’outil');
  calls.length = 0;
  draw(context, result, initialCamera(), fit(result, initialCamera(), 100, 100), { layer: 99, previous: true, travel: true, cursor: null, printed: null }, palette, 100, 100);
  assert.deepEqual(calls, ['clearRect']);
});

test('lecture : progression, code d’erreur du serveur, annulation qui libère la réponse', async () => {
  const progress: number[] = [];
  const ok = async () => new Response(gcode, { headers: { 'content-length': String(gcode.length) } });
  const result = await loadGcode({ kind: 'machine', machineId: id, path: 'a.gcode' }, { laser: false, signal: new AbortController().signal, fetcher: ok, onProgress: (read, size) => progress.push(Math.round(read / size * 100)) });
  assert.equal(result.layers.length, 2);
  assert.equal(progress.at(-1), 100);
  const refused = async () => Response.json({ error: 'missing' }, { status: 404 });
  await assert.rejects(loadGcode({ kind: 'machine', machineId: id, path: 'a.gcode' }, { laser: false, signal: new AbortController().signal, fetcher: refused }), (error: unknown) => error instanceof ViewerLoadError && error.code === 'missing');
  const odd = async () => Response.json({ error: '<script>' }, { status: 500 });
  await assert.rejects(loadGcode({ kind: 'machine', machineId: id, path: 'a.gcode' }, { laser: false, signal: new AbortController().signal, fetcher: odd }), (error: unknown) => error instanceof ViewerLoadError && error.code === 'files-unavailable');
  // Flux sans fin : l'annulation interrompt la lecture et annule le corps.
  let cancelled = false;
  const endless = new ReadableStream<Uint8Array>({ pull: controller => { controller.enqueue(new TextEncoder().encode('G1 X1 Y1 E1\n')); return new Promise(resolve => setTimeout(resolve, 5)); }, cancel: () => { cancelled = true; } });
  const controller = new AbortController();
  const reading = loadGcode({ kind: 'machine', machineId: id, path: 'a.gcode' }, { laser: false, signal: controller.signal, fetcher: async () => new Response(endless) });
  setTimeout(() => controller.abort(), 30);
  await assert.rejects(reading);
  assert.equal(cancelled, true);
  const local = await loadGcode({ kind: 'local', file: new Blob([gcode]) }, { laser: false, signal: new AbortController().signal });
  assert.equal(local.types.length, result.types.length, 'fichier local lu sans réseau');
});
