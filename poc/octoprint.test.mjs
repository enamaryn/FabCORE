import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readOctoPrint } from './octoprint.mjs';

const machine = { origin: 'http://192.168.1.42:5000', apiKey: 'test-key' };

test('OctoPrint lit le travail et les températures avec une clé API', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push(url);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { 'X-Api-Key': machine.apiKey });
    return url.endsWith('/job')
      ? Response.json({ state: 'Printing', job: { file: { display: 'Pièce' } }, progress: { completion: 74.6 } })
      : Response.json({ temperature: { tool0: { actual: 207.65 }, bed: { actual: 55 } } });
  };
  assert.deepEqual(await readOctoPrint(machine, { fetcher }), {
    status: 'printing', issue: null, nozzle: 207.7, bed: 55, progress: 75, file: 'Pièce'
  });
  assert.deepEqual(requests, [machine.origin + '/api/job', machine.origin + '/api/printer']);
});

test('OctoPrint distingue clé refusée, imprimante déconnectée et serveur injoignable', async () => {
  assert.equal((await readOctoPrint(machine, { fetcher: async () => new Response(null, { status: 403 }) })).issue, 'octoprint-access');
  assert.equal((await readOctoPrint(machine, { fetcher: async () => Response.json({ state: 'Offline' }) })).issue, 'octoprint-disconnected');
  assert.equal((await readOctoPrint(machine, { fetcher: async () => { throw new TypeError('network'); } })).issue, 'octoprint-connection');
  assert.equal((await readOctoPrint({ ...machine, origin: 'http://example.com' }, { fetcher: assert.fail })).issue, 'octoprint-access');
});
