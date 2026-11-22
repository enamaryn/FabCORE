import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConnectorRegistry } from './connectors.mjs';

function slowRegistry(isCurrent) {
  let release;
  const reads = [];
  const connector = { read: machine => { reads.push(machine.id); return { status: 'ready' }; }, close() {} };
  const registry = createConnectorRegistry({ isCurrent }, () => ({ load: () => new Promise(resolve => { release = () => resolve(connector); }) }));
  return { registry, reads, release: async () => { while (!release) await new Promise(resolve => setImmediate(resolve)); release(); } };
}

test('registre : une machine supprimée ou modifiée pendant le chargement n’est pas lue', async () => {
  const current = new Set();
  const machine = { id: 'a' }, replaced = { id: 'a' };
  current.add(machine);
  const { registry, reads, release } = slowRegistry(m => current.has(m));
  const pending = registry.read('fake', machine);
  current.delete(machine); current.add(replaced);
  await release();
  await assert.rejects(pending, /machine-removed/);
  assert.deepEqual(reads, [], 'aucune session rouverte avec l’ancienne configuration');
  assert.deepEqual(await registry.read('fake', replaced), { status: 'ready' });
  assert.deepEqual(reads, ['a']);
});

test('registre : aucune lecture ni chargement après fermeture', async () => {
  const machine = { id: 'a' };
  const { registry, reads, release } = slowRegistry(() => true);
  const pending = registry.read('fake', machine);
  registry.close();
  await release();
  assert.equal(await pending, null, 'un connecteur chargé après fermeture est refermé, pas utilisé');
  assert.equal(await registry.read('fake', machine), null);
  assert.deepEqual(reads, []);
});
