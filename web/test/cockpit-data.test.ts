import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../src/route.ts';
import { recordTemperatures } from '../src/temperature.ts';
import type { MachineData } from '../src/types.ts';
const base: MachineData = { id: 'one', name: 'A', kind: 'klipper', status: 'ready', cameraOpen: false, model: 'Moonraker', nozzle: 20, bed: null, checkedAt: '2026-11-23T12:00:00Z' };
test('Historique : mesures datées, cadence plafonnée, conservation 30 minutes et suppression machine', () => {
  const first = recordTemperatures(new Map(), [base]); assert.equal(first.get('one')?.length, 1);
  assert.equal(recordTemperatures(first, [base]), first);
  for (const m of [{ ...base, status: 'offline' }, { ...base, checkedAt: 'invalid' }, { ...base, nozzle: null }, { ...base, checkedAt: '2026-11-23T12:00:09Z' }]) assert.equal(recordTemperatures(first, [m as MachineData]), first);
  const next = recordTemperatures(first, [{ ...base, checkedAt: '2026-11-23T12:00:10Z', nozzle: null, bed: 30 }]); assert.deepEqual(next.get('one')?.at(-1), { at: Date.parse('2026-11-23T12:00:10Z'), nozzle: null, bed: 30 });
  const later = recordTemperatures(next, [{ ...base, checkedAt: '2026-11-23T12:31:00Z' }]); assert.equal(later.get('one')?.length, 1);
  assert.equal(recordTemperatures(later, []).size, 0);
});
test('Navigation : route machine stable et lien clavier sans changement d’écran', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(parseRoute('#machine/' + id), { kind: 'machine', id }); assert.equal(parseRoute('#content'), null);
  assert.equal(parseRoute('#machine/<script>'), null); assert.deepEqual(parseRoute('#machines'), { kind: 'machines' });
});
