import test from 'node:test';
import assert from 'node:assert/strict';
import { bambuFilaments } from './filaments.mjs';

test('AMS : seul le pourcentage brut valide est une humidité, jamais l’indice 1–5', () => {
  const read = unit => bambuFilaments({ ams: [{ id: '0', ...unit }] })[0].humidity;
  assert.equal(read({ humidity: '4' }), null);
  assert.equal(read({ humidity: '4', humidity_raw: '38' }), 38);
  assert.equal(read({ humidity_raw: 0 }), 0);
  assert.equal(read({ humidity_raw: 100 }), 100);
  for (const value of [null, '', true, -1, 101, 'unknown', {}, []]) {
    assert.equal(read({ humidity_raw: value }), null);
  }
  const modules = bambuFilaments({ ams: [{ id: '0', humidity_raw: '28' }, { id: '1', humidity_raw: '42' }, { id: '128', humidity_raw: '19' }] });
  assert.deepEqual(modules.map(unit => unit.humidity), [28, 42, 19]);
});
