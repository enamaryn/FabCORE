import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoonrakerTramming, storedTramming, trammingPoints, trammingResult } from '../src/tramming.ts';

const machine = { origin: 'http://192.168.1.20:7125', apiKey: 'test-key' };
const ports = { validOrigin: (origin: string) => origin === machine.origin ? origin : null, readResponse: (response: Response) => response.json() };

test('Nivellement : quatre points atteignables par la sonde décalée (Ender 3 V2, BLTouch -41.5/-7)', () => {
  const points = trammingPoints([0, 0, -2], [220, 220, 250], { x: -41.5, y: -7 });
  assert.deepEqual(points, [
    { corner: 'front-left', x: 25, y: 25 }, { corner: 'front-right', x: 153.5, y: 25 },
    { corner: 'back-right', x: 153.5, y: 188 }, { corner: 'back-left', x: 25, y: 188 },
  ]);
  // Chaque buse correspondante reste dans les limites des axes.
  for (const point of points!) { assert.ok(point.x + 41.5 <= 220 && point.x + 41.5 >= 0); assert.ok(point.y + 7 <= 220); }
  assert.equal(trammingPoints([0, 0], [30, 30], { x: 0, y: 0 }), null, 'plateau trop petit');
  assert.equal(trammingPoints([0, 0], [Number.NaN, 220], { x: 0, y: 0 }), null);
});

test('Nivellement : écarts au coin avant gauche et planéité = écart maximal', () => {
  const result = trammingResult([
    { corner: 'front-left', x: 25, y: 25, z: 1.5 }, { corner: 'front-right', x: 153.5, y: 25, z: 1.62 },
    { corner: 'back-right', x: 153.5, y: 188, z: 1.41 }, { corner: 'back-left', x: 25, y: 188, z: 1.5 },
  ], '2026-11-27T15:00:00.000Z');
  assert.equal(result?.range, 0.21);
  assert.deepEqual(result?.deviations.map(item => item.delta), [0, 0.12, -0.09, 0]);
  assert.deepEqual(storedTramming(result), result, 'relu à l’identique');
  for (const bad of [null, {}, { at: 'x', points: [] }, { ...result, points: result!.points.slice(0, 3) }, { ...result, points: [...result!.points].reverse() }]) assert.equal(storedTramming(bad), null);
});

function fixture({ homed = 'xyz', state = 'standby', klippy = 'ready', probe = true, fail = '' } = {}) {
  const scripts: string[] = []; let z = 1.25;
  const fetcher = async (url: string, options: RequestInit = {}) => {
    assert.equal(new Headers(options.headers).get('X-Api-Key'), 'test-key'); assert.equal(options.redirect, 'error');
    if (url.includes('/printer/objects/query?configfile')) return Response.json({ result: { status: {
      configfile: { settings: probe ? { bltouch: { x_offset: -41.5, y_offset: -7 } } : {} },
      toolhead: { homed_axes: homed, axis_minimum: [0, 0, -2, 0], axis_maximum: [220, 220, 250, 0] },
      print_stats: { state }, webhooks: { state: klippy } } } });
    if (url.endsWith('/printer/objects/query?probe')) return Response.json({ result: { status: { probe: { last_z_result: z } } } });
    if (url.endsWith('/printer/gcode/script')) {
      scripts.push(JSON.parse(String(options.body)).script);
      if (fail) return Response.json({ error: { message: fail } }, { status: 400 });
      z += 0.05; return Response.json({ result: 'ok' });
    }
    throw new Error('unexpected ' + url);
  };
  return { scripts, service: createMoonrakerTramming(ports, fetcher) };
}

test('Nivellement : origine seulement si nécessaire, buse placée pour la sonde, PROBE puis lecture du résultat', async () => {
  const cold = fixture({ homed: '' });
  const first = await cold.service.measure(machine, 0);
  assert.deepEqual(first, { corner: 'front-left', x: 25, y: 25, z: 1.3 });
  assert.equal(cold.scripts[0], 'G28\nG90\nG1 Z5 F600\nG1 X66.5 Y32 F6000\nPROBE');
  const homed = fixture();
  await homed.service.measure(machine, 2);
  assert.equal(homed.scripts[0], 'G90\nG1 Z5 F600\nG1 X195 Y195 F6000\nPROBE');
});

test('Nivellement : refusé sans sonde, pendant une impression, Klipper non prêt ou verrou pris ; erreur native remontée', async () => {
  assert.equal((await fixture({ probe: false }).service.geometry(machine)).reason, 'no-probe');
  for (const [options, code] of [[{ probe: false }, /tramming-unavailable/], [{ state: 'printing' }, /tramming-state/], [{ klippy: 'shutdown' }, /tramming-state/]] as const) {
    const h = fixture(options); await assert.rejects(h.service.measure(machine, 0), code); assert.equal(h.scripts.length, 0);
  }
  const busy = fixture(); await assert.rejects(busy.service.measure(machine, 0, () => false), /command-busy/); assert.equal(busy.scripts.length, 0);
  await assert.rejects(fixture().service.measure(machine, 4), /tramming-invalid/);
  const failed = fixture({ fail: 'Probe triggered prior to movement' });
  await assert.rejects(failed.service.measure(machine, 0), (error: Error & { nativeMessage?: string }) => error.message === 'tramming-failed' && error.nativeMessage === 'Probe triggered prior to movement');
  assert.equal(failed.scripts.length, 1, 'jamais renvoyé');
});
