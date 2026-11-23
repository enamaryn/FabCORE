import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { currentRequestId, requestIdFrom, withRequestId } from './correlation.ts';

test('corrélation : identifiant entrant validé, sinon généré', () => {
  assert.equal(requestIdFrom('proxy-req-0001'), 'proxy-req-0001');
  for (const unsafe of ['court', 'a b c d e f g h', 'x'.repeat(65), 'id\ninjecté-0001', undefined, ['proxy-req-0001']]) {
    assert.match(requestIdFrom(unsafe), /^[0-9a-f-]{36}$/, `remplacé : ${String(unsafe).slice(0, 10)}`);
  }
});

test('corrélation : présent pendant la requête, absent après la fermeture de la réponse', async () => {
  const response = new EventEmitter();
  let later: string | undefined = 'non lu';
  await withRequestId('request-0001', response, async () => {
    assert.equal(currentRequestId(), 'request-0001');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(currentRequestId(), 'request-0001', 'conservé à travers les appels asynchrones');
    // Une session ouverte pendant la requête garde ce contexte : ses traces ultérieures ne doivent pas s'y rattacher.
    setTimeout(() => { later = currentRequestId(); }, 5);
  });
  response.emit('close');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(later, undefined);
  assert.equal(currentRequestId(), undefined, 'hors requête');
});
