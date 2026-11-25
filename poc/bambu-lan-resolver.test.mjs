import test from 'node:test';
import assert from 'node:assert/strict';
import { createBambuLanResolver } from './bambu-lan-resolver.mjs';
const serial = 'P2STEST123';
const network = { cidr: '192.168.1.0/29', start: 3232235776, end: 3232235783, own: ['192.168.1.1'] };

test('Résolution Bambu : série exacte, scan partagé, cache et changement d’adresse', async t => {
  let now = 1000, calls = 0, host = '192.168.1.3';
  const resolver = createBambuLanResolver({ networks: () => [network], now: () => now,
    probe: async ip => { calls++; return { kind: 'bambu', host: ip, serial: ip === host ? serial : 'FOREIGN123' }; } }); t.after(() => resolver.close());
  const [a, b] = await Promise.all([resolver.resolve(serial), resolver.resolve(serial)]);
  assert.equal(a, host); assert.equal(b, host); assert.equal(calls, 5);
  assert.equal(await resolver.resolve('NOTFOUND12'), null); assert.equal(calls, 5);
  assert.equal(await resolver.resolve(serial), host); assert.equal(calls, 5);
  now += 300001; host = '192.168.1.5';
  assert.equal(await resolver.resolve(serial), host); assert.equal(calls, 10);
});

test('Résolution Bambu : pas de correspondance ambiguë, hôte falsifié ou réseau public', async t => {
  const ambiguous = createBambuLanResolver({ networks: () => [network], probe: async host => ({ kind: 'bambu', host, serial }) }); t.after(() => ambiguous.close());
  assert.equal(await ambiguous.resolve(serial), null);
  let calls = 0;
  const foreign = createBambuLanResolver({ networks: () => [{ ...network, start: 134744064, end: 134744071 }], probe: async () => { calls++; return null; } }); t.after(() => foreign.close());
  assert.equal(await foreign.resolve(serial), null); assert.equal(calls, 0);
  const spoof = createBambuLanResolver({ networks: () => [network], probe: async () => ({ kind: 'bambu', host: '192.168.2.10', serial }) }); t.after(() => spoof.close());
  assert.equal(await spoof.resolve(serial), null);
});

test('Résolution Bambu : annuler un aperçu ne coupe pas une découverte partagée ; fermeture définitive', async () => {
  const abort = new AbortController(); let release;
  const gate = new Promise(resolve => { release = resolve; }); let calls = 0;
  const resolver = createBambuLanResolver({ networks: () => [network], probe: async host => { calls++; await gate; return host.endsWith('.3') ? { kind: 'bambu', host, serial } : null; } });
  const canceled = resolver.resolve(serial, abort.signal), other = resolver.resolve(serial);
  abort.abort(); assert.equal(await canceled, null);
  release(); assert.equal(await other, '192.168.1.3');
  resolver.close(); const before = calls; assert.equal(await resolver.resolve(serial), null); assert.equal(calls, before);
});
