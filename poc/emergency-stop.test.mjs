import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emergencyStopMoonraker } from './moonraker.mjs';
import { connectorCatalog } from './connectors.mjs';

const machine = { origin: 'http://192.168.1.50:7125', apiKey: 'test-key' };
test('urgence Moonraker : primitive native, authentification existante et code préservé', async () => {
  const sent = [];
  const result = await emergencyStopMoonraker(machine, async (url, options) => {
    sent.push({ url, options }); return Response.json({ result: 'ok' });
  });
  assert.deepEqual(result, { outcome: 'accepted', nativeCode: 200 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, machine.origin + '/printer/emergency_stop');
  assert.equal(sent[0].options.headers['X-Api-Key'], machine.apiKey);
  assert.equal(sent[0].options.method, 'POST');
});
test('urgence : refus, réponse perdue, erreur serveur et corps inconnu sans rejeu', async () => {
  for (const [response, expected] of [[new Response('', { status: 403 }), { outcome: 'rejected', nativeCode: 403 }], [new Response('', { status: 503 }), { outcome: 'unknown', nativeCode: 503 }], [Response.json({ result: false }), { outcome: 'unknown', nativeCode: 200 }], [new Response('not JSON'), { outcome: 'unknown', nativeCode: 200 }], [null, { outcome: 'unknown' }]]) {
    let writes = 0;
    const result = await emergencyStopMoonraker(machine, async () => { writes++; if (!response) throw new Error('network/timeout'); return response; });
    assert.deepEqual(result, expected); assert.equal(writes, 1);
  }
});
test('urgence : seules les capacités prouvées sont exposées ; aucune inférence 1007/M112/CANCEL', () => {
  assert.ok(connectorCatalog.klipper.commandActions.includes('emergencyStop'));
  for (const [kind, value] of Object.entries(connectorCatalog)) if (kind !== 'klipper') assert.equal(value.commandActions.includes('emergencyStop'), false, kind);
});
