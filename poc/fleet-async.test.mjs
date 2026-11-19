import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createFabCore } from './server.mjs';
import { openStore } from './store.mjs';

test('parc mixte : attend les connecteurs instrumentés et conserve les machines si une lecture échoue', async ctx => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-fleet-')); ctx.after(() => rm(directory, { recursive: true, force: true }));
  const store = openStore(directory);
  const machines = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'CC2', kind: 'elegoo', origin: 'mqtt://192.168.1.10:1883', serial: 'TEST_CC2' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'LAN failure', kind: 'bambu', origin: 'mqtts://192.168.1.11:8883', serial: 'TEST_LAN' },
    { id: '33333333-3333-3333-3333-333333333333', name: 'Cloud', kind: 'bambu-cloud', origin: 'mqtts://us.mqtt.bambulab.com:8883', serial: 'TEST_CLOUD', cloudAccountId: 'none', model: 'Bambu Lab · P2S' }
  ];
  store.save({ ...store.state, machines });
  let fail = false;
  const { server } = createFabCore({ directory, origin: 'http://fabcore.test', activationToken: 'activation',
    readCC2: async () => ({ status: 'ready', issue: null, nozzle: 23, bed: 20, progress: 0, file: '' }),
    bambu: { read: () => { if (fail) throw new Error('unreachable'); return { status: 'ready', issue: null, nozzle: 24, bed: 19, progress: 0, file: '' }; } }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); ctx.after(() => new Promise(resolve => server.close(resolve)));
  const call = (path, body, cookie) => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method: body ? 'POST' : 'GET', headers: {
      Host: 'fabcore.test', Origin: 'http://fabcore.test', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {})
    } }, async res => { let text = ''; for await (const chunk of res) text += chunk; resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(text) }); });
    req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
  });
  const session = await call('/api/setup', { token: 'activation', username: 'admin', password: 'test-password-long' });
  const cookie = session.headers['set-cookie'][0].split(';')[0];
  await call('/api/machines', null, cookie); // Warm the cached non-live connector.
  const initial = await call('/api/machines', null, cookie);
  assert.equal(initial.status, 200); assert.equal(initial.data.machines.length, 3);
  assert.equal(initial.data.machines[0].status, 'ready'); assert.equal(initial.data.machines[0].nozzle, 23);
  assert.equal(initial.data.machines[1].status, 'ready'); assert.equal(initial.data.machines[1].bed, 19);
  fail = true;
  const failed = await call('/api/machines', null, cookie);
  assert.equal(failed.status, 200); assert.equal(failed.data.machines.length, 3);
  assert.equal(failed.data.machines[0].status, 'ready'); assert.equal(failed.data.machines[1].status, 'offline');
  assert.equal(openStore(directory).state.machines.length, 3);
});
