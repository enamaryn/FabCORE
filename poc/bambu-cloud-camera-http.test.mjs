import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFabCore } from './server.mjs';

test('HTTP caméra Cloud : configuration admin, source réelle, aperçu observateur et secrets inaccessibles', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-cloud-camera-http-')); t.after(() => rm(directory, { recursive: true, force: true }));
  let opens = 0, binds = 0;
  const origin = 'http://fabcore.test';
  const { server, token } = createFabCore({ directory, origin, experimentalCloudCamera: true,
    cloudFetch: async url => {
      if (url.endsWith('/login')) return Response.json({ accessToken: 'TEST.private.token' });
      if (url.endsWith('/preference')) return Response.json({ uid: 123 });
      binds++; return Response.json({ devices: [{ dev_id: 'P2STEST123', name: 'P2S', dev_product_name: 'P2S', dev_access_code: 'ABCD1234' }] });
    },
    cloudMqtt: (_url, options) => { const client = new EventEmitter(); client.options = options; client.end = () => {}; return client; },
    cloudCameraStream: async (machine, output, signal, onFrame) => {
      opens++; assert.equal(machine.accessCode, 'ABCD1234'); assert.equal(machine.origin, 'mqtts://192.168.1.20:8883');
      const ended = new Promise(resolve => { if (signal.aborted) resolve(); else signal.addEventListener('abort', resolve, { once: true }); });
      output.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame' });
      output.write(Buffer.concat([Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'), Buffer.from([255, 216, 255, 217]), Buffer.from('\r\n--frame\r\n')])); onFrame(); await ended; return true;
    }
  });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const call = (path, body, cookie, site = origin) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method: body === undefined ? 'GET' : 'POST', headers: { Host: 'fabcore.test', Origin: site, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk); const bytes = Buffer.concat(chunks); resolve({ status: res.statusCode, headers: res.headers, bytes, data: res.headers['content-type']?.includes('json') ? JSON.parse(bytes) : null });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const setup = await call('/api/setup', { username: 'atelier', password: 'camera-test-password', token }); const admin = setup.headers['set-cookie'][0].split(';')[0];
  const account = (await call('/api/cloud-accounts', { provider: 'bambu', name: 'Atelier', email: 'test@example.com', region: 'global' }, admin)).data;
  await call(`/api/cloud-accounts/${account.id}/login`, { password: 'camera-password' }, admin);
  const id = (await call(`/api/cloud-accounts/${account.id}/import`, { serial: 'P2STEST123' }, admin)).data.id;
  await call('/api/observers', { username: 'observer', password: 'observer-test-password' }, admin); const observer = (await call('/api/login', { username: 'observer', password: 'observer-test-password' })).headers['set-cookie'][0].split(';')[0];
  const config = '/api/machines/' + id + '/camera-settings', camera = '/api/machines/' + id + '/camera/preview', body = { mode: 'auto', host: '192.168.1.20' };
  assert.equal((await call(config, body)).status, 401); assert.equal((await call(config, body, observer)).status, 403); assert.equal((await call(config, body, admin, 'http://evil.test')).status, 403);
  assert.equal((await call(config, { mode: 'lan', host: '169.254.169.254' }, admin)).status, 400);
  assert.equal((await call(camera, undefined, admin)).data.error, 'camera-disabled');
  assert.equal((await call(config, { ...body, accessCode: 'IGNORE' }, admin)).status, 200);
  const fleet = (await call('/api/machines', undefined, observer)).data.machines[0]; assert.equal(fleet.kind, 'bambu-cloud'); assert.equal(fleet.camera.source, 'lan'); assert.equal(fleet.camera.transport, 'rtsps'); assert.equal(fleet.capabilities.commands, false); assert.doesNotMatch(JSON.stringify(fleet), /ABCD1234|IGNORE|TEST.private/);
  assert.equal((await call(camera)).status, 401); assert.equal(opens, 0);
  const preview = await call(camera, undefined, observer); assert.equal(preview.status, 200); assert.equal(preview.headers['content-type'], 'image/jpeg'); assert.deepEqual([...preview.bytes], [255, 216, 255, 217]);
  const again = await call(camera, undefined, admin); assert.equal(again.status, 200); assert.equal(binds, 2, 'credential inventory shared for preview/reopen');
  await call(config, { mode: 'cloud', host: '' }, admin); assert.equal((await call(camera, undefined, admin)).data.error, 'camera-cloud-unqualified');
  const logs = await call('/api/machines/' + id + '/logs', undefined, admin); assert.doesNotMatch(logs.bytes.toString(), /ABCD1234|TEST.private/);
});
