import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { X509Certificate, constants, privateDecrypt, verify } from 'node:crypto';
import { createCloudMonitor } from './bambu-cloud-monitor.mjs';
import { createBambuSigner, canonicalJson } from './bambu-signing.mjs';
import { createCloudCommands } from '../connectors/bambu/src/commands.ts';
import { createBambuCloudFiles } from './bambu-cloud-files.mjs';
import { Readable } from 'node:stream';

const tick = () => new Promise(resolve => setImmediate(resolve));
function certificates() {
  const directory = mkdtempSync(join(tmpdir(), 'fabcore-sign-cloud-'));
  try {
    const pair = name => {
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=' + name,
        '-keyout', join(directory, name + '.key'), '-out', join(directory, name + '.pem')], { stdio: 'ignore' });
      return { key: readFileSync(join(directory, name + '.key'), 'utf8'), cert: readFileSync(join(directory, name + '.pem'), 'utf8') };
    };
    return { app: pair('app'), printer: pair('printer') };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
function harness(createSigner) {
  const wires = [], logs = []; let authorized = true;
  const client = Object.assign(new EventEmitter(), {
    options: {}, end() {},
    subscribe(topics, _opts, callback) { callback(null, topics.map(() => ({ qos: 0 }))); },
    publish(topic, wire, _opts, callback) { wires.push({ topic, wire, body: JSON.parse(wire) }); callback?.(); },
  });
  const monitor = createCloudMonitor({ account: { region: 'global', devices: [{ serial: 'P2S' }] }, token: 'FAKE-TOKEN', username: 'u_1',
    createSigner, authorized: () => authorized, connectMqtt: () => client, log: (event, details) => logs.push({ event, details }) });
  const receive = body => client.emit('message', 'device/P2S/report', Buffer.from(JSON.stringify(body)));
  const ready = () => { client.emit('connect'); receive({ print: { command: 'push_status', gcode_state: 'IDLE', nozzle_temper: 23, lights_report: [{ node: 'chamber_light', mode: 'off' }] } }); };
  return { monitor, client, wires, logs, receive, ready, revoke() { authorized = false; } };
}

test('Cloud P2S : installation corrélée puis G-code chiffré et signé, pause signée et éclairage natif', async t => {
  const { app, printer } = certificates();
  const identity = createBambuSigner({ key: app.key, chain: app.cert, crl: 'TEST-CRL-NOT-LOGGED' });
  const h = harness(() => identity); t.after(() => h.monitor.close()); h.ready();
  assert.equal(h.wires.length, 2, 'la lecture seule ne déclenche aucune installation');
  const homing = h.monitor.send('P2S', 'gcode_line', { param: 'G28\n' });
  const install = h.wires.at(-1).body.security;
  assert.equal(install.command, 'app_cert_install'); assert.equal(install.app_cert, app.cert);
  h.receive({ security: { command: 'app_cert_install', sequence_id: install.sequence_id, result: 'SUCCESS', printer_cert: printer.cert } });
  await tick();
  const signed = h.wires.at(-1);
  assert.ok(signed.wire.startsWith('{"header":'));
  assert.equal(signed.body.print.command, 'gcode_line'); assert.equal(signed.body.print.param, undefined);
  assert.equal(privateDecrypt({ key: printer.key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(signed.body.print.param_enc, 'base64')).toString(), 'G28\n');
  const payload = Buffer.from('{"print":' + canonicalJson(signed.body.print) + '}');
  assert.equal(verify('sha256', payload, new X509Certificate(app.cert).publicKey, Buffer.from(signed.body.header.sign_string, 'base64')), true);
  h.receive({ print: { command: 'gcode_line', sequence_id: signed.body.print.sequence_id, result: 'success' } });
  assert.equal(await homing, true);
  for (const [command, params] of [
    ['gcode_line', { param: 'G91\nG1 X1 F3000\nG90\n' }],
    ['gcode_line', { param: 'M104 S100\n' }],
    ['gcode_line', { param: 'M106 P1 S128\n' }],
    ['project_file', { param: 'Metadata/plate_1.gcode', url: 'ftp:///cube.3mf' }],
    ['gcode_file', { param: '/cube.gcode' }],
  ]) {
    const sending = h.monitor.send('P2S', command, params); await tick();
    const body = h.wires.at(-1).body;
    assert.ok(body.header);
    for (const [field, value] of Object.entries(params)) {
      assert.equal(body.print[field], undefined);
      assert.equal(privateDecrypt({ key: printer.key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(body.print[field + '_enc'], 'base64')).toString(), value);
    }
    h.receive({ print: { command, sequence_id: body.print.sequence_id, result: 'success' } });
    assert.equal(await sending, true);
  }
  const pause = h.monitor.send('P2S', 'pause', { param: '' }); await tick();
  const paused = h.wires.at(-1).body; assert.ok(paused.header); assert.equal(paused.print.param, '');
  assert.ok(Number(paused.print.sequence_id) > Number(signed.body.print.sequence_id));
  assert.equal(typeof paused.print.sequence_id, 'string');
  h.receive({ print: { ...paused.print, result: 'success' } }); assert.equal(await pause, true);
  const light = h.monitor.send('P2S', 'ledctrl', { led_node: 'chamber_light', led_mode: 'on' }, 'system');
  const led = h.wires.at(-1).body; assert.equal(led.header, undefined); assert.equal(led.system.command, 'ledctrl');
  h.receive({ system: { ...led.system, result: 'SUCCESS' } }); assert.equal(await light, true);
  assert.equal(h.wires.filter(item => item.body.security?.command === 'app_cert_install').length, 1);
  assert.ok(h.wires.every(item => item.topic === 'device/P2S/request'));
  assert.doesNotMatch(JSON.stringify(h.logs), /PRIVATE KEY|BEGIN CERTIFICATE|TEST-CRL-NOT-LOGGED|sign_string|param_enc/);
});

test('Cloud P2S : PEM absents, refus installation, révocation et reconnexion ne déclenchent aucun repli brut', async t => {
  const missing = harness(() => null); t.after(() => missing.monitor.close()); missing.ready();
  await assert.rejects(missing.monitor.send('P2S', 'pause'), /bambu-authorization/); assert.equal(missing.wires.length, 2);
  const identity = { revision: 'one', install: id => JSON.stringify({ security: { command: 'app_cert_install', sequence_id: id } }), sign() { assert.fail('do not sign after refusal'); } };
  const h = harness(() => identity); t.after(() => h.monitor.close()); h.ready();
  const refused = h.monitor.send('P2S', 'pause'); const install = h.wires.at(-1).body.security;
  h.receive({ security: { ...install, result: 'FAILED' } }); await assert.rejects(refused, /bambu-authorization/);
  assert.equal(h.wires.some(item => item.body.print), false);
  const lost = h.monitor.send('P2S', 'pause'); h.client.emit('close'); await assert.rejects(lost, /command-unconfirmed/);
  h.ready(); assert.equal(h.wires.some(item => item.body.print), false, 'aucun rejeu après reconnexion');
  h.revoke(); const count = h.wires.length;
  await assert.rejects(h.monitor.send('P2S', 'ledctrl', {}, 'system'), /bambu-connection/);
  assert.equal(h.wires.length, count);
});

test('Commandes cloud : ACK étranger ignoré, timeout borné, aucune publication de contrôle sans cert imprimante', async () => {
  const wires = [];
  const commands = createCloudCommands({ timeoutMs: 20, fresh: () => true, log() {},
    publish: (_serial, wire, done) => { wires.push(JSON.parse(wire)); done(); },
    createSigner: () => ({ revision: 'x', install: id => JSON.stringify({ security: { command: 'app_cert_install', sequence_id: id } }), sign() { assert.fail('missing printer cert'); } }) });
  try {
    const attempt = commands.send('ONE', 'gcode_line', { param: 'G28\n' });
    const install = wires.at(-1).security;
    assert.equal(commands.receive('OTHER', { security: { ...install, result: 'SUCCESS' } }), false);
    assert.equal(commands.receive('ONE', { print: { ...install, result: 'SUCCESS' } }), false);
    await assert.rejects(attempt, /command-unconfirmed/);
    const retry = commands.send('ONE', 'gcode_line', { param: 'G28\n' });
    commands.receive('ONE', { security: { ...wires.at(-1).security, result: 'SUCCESS' } }); await tick();
    const list = wires.at(-1).security; assert.equal(list.command, 'app_cert_list');
    commands.receive('ONE', { security: { ...list, result: 'SUCCESS' } });
    await assert.rejects(retry, /bambu-authorization/); assert.equal(wires.some(item => item.print), false);
  } finally { commands.reset(); }
});

test('Fichiers cloud : inventaire, upload et téléchargement via FTPS LAN ; lancement via send cloud', async () => {
  const machine = { id: 'P2S', kind: 'bambu-cloud', origin: 'mqtts://us.mqtt.bambulab.com:8883', serial: 'P2S' };
  const connections = [], sent = []; let uploads = '', closed = 0;
  const files = createBambuCloudFiles({
    async fileConnection(target) { assert.equal(target, machine); return { ...target, origin: 'mqtts://192.168.1.50:8883', accessCode: 'LOCALCODE' }; },
    send(target, command, params) { sent.push({ target, command, params }); return true; }
  }, () => ({
    async access(options) { connections.push(options); },
    async list(directory) { return directory === '/' ? [{ name: 'cube.gcode', isFile: true, size: 4 }] : []; },
    async downloadTo(stream) { stream.end('G28\n'); },
    async uploadFrom(stream) { for await (const part of stream) uploads += part; },
    close() { closed++; }
  }));
  assert.equal((await files.list(machine))[0].path, 'cube.gcode');
  assert.equal(await files.upload(machine, 'new.gcode', Readable.from(['M105\n'])), 'new.gcode');
  assert.equal(uploads, 'M105\n');
  assert.equal(await (await files.download(machine, 'cube.gcode')).text(), 'G28\n');
  await files.start(machine, 'cube.gcode');
  assert.equal(sent[0].target, machine); assert.equal(sent[0].command, 'gcode_file');
  assert.ok(connections.every(options => options.host === '192.168.1.50' && options.port === 990 && options.secureOptions.rejectUnauthorized));
  assert.equal(closed, 3);
});

test('HTTP : machine importée du compte cloud, droits admin, origine et homing signé depuis le coffre', async t => {
  const { createFabCore } = await import('./server.mjs');
  const { request } = await import('node:http');
  const { app, printer } = certificates();
  const directory = mkdtempSync(join(tmpdir(), 'fabcore-cloud-controls-http-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const published = []; let mqtt;
  const report = body => mqtt.emit('message', 'device/P2STEST123/report', Buffer.from(JSON.stringify(body)));
  const origin = 'http://fabcore.test';
  const { server, token } = createFabCore({ directory, origin,
    cloudFetch: async url => Response.json(url.endsWith('/login') ? { accessToken: 'FAKE-CLOUD-TOKEN' } : url.endsWith('/preference') ? { uid: 123 } : { devices: [{ dev_id: 'P2STEST123', name: 'P2S', dev_product_name: 'P2S', dev_access_code: 'ABCD1234' }] }),
    cloudMqtt: () => {
      mqtt = Object.assign(new EventEmitter(), { options: {}, end() {},
        subscribe(topics, _opts, callback) { callback(null, topics.map(() => ({ qos: 0 }))); },
        publish(_topic, wire, _opts, callback) {
          const envelope = JSON.parse(wire); published.push(envelope); callback?.();
          if (envelope.security) queueMicrotask(() => report({ security: { command: 'app_cert_install', sequence_id: envelope.security.sequence_id, result: 'SUCCESS', printer_cert: printer.cert } }));
          if (envelope.print) queueMicrotask(() => report({ print: { command: envelope.print.command, sequence_id: envelope.print.sequence_id, result: 'success' } }));
        } }); return mqtt;
    } });
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const call = (path, body, cookie, site = origin) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method: body === undefined ? 'GET' : 'POST', headers: { Host: 'fabcore.test', Origin: site, ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) } }, async res => {
      const chunks = []; for await (const chunk of res) chunks.push(chunk);
      resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks)) });
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const installed = await call('/api/setup', { username: 'atelier', password: 'cloud-control-test-password', token });
  const admin = installed.headers['set-cookie'][0].split(';')[0];
  const account = (await call('/api/cloud-accounts', { provider: 'bambu', name: 'Atelier', email: 'test@example.com', region: 'global' }, admin)).body;
  await call(`/api/cloud-accounts/${account.id}/login`, { password: 'password' }, admin);
  const id = (await call(`/api/cloud-accounts/${account.id}/import`, { serial: 'P2STEST123' }, admin)).body.id;
  assert.match(id, /^[a-f0-9-]{36}$/);
  mqtt.emit('connect'); report({ print: { command: 'push_status', gcode_state: 'FAILED', print_error: 0, subtask_name: 'old-failed-job', nozzle_temper: 23, bed_temper: 21 } });
  const fleet = (await call('/api/machines', undefined, admin)).body.machines[0];
  assert.equal(fleet.kind, 'bambu-cloud'); assert.equal(fleet.capabilities.controls, true); assert.equal(fleet.capabilities.files, true);
  const url = '/api/machines/' + id + '/controls', home = { action: 'home', confirm: true };
  assert.equal((await call(url, undefined, admin)).body.status, 'ready', 'les contrôles traitent FAILED + print_error=0 comme au repos');
  assert.equal((await call(url, home)).status, 401);
  assert.equal((await call(url, home, admin, 'http://foreign.test')).status, 403);
  await call('/api/observers', { username: 'viewer', password: 'observer-control-password' }, admin);
  const observer = (await call('/api/login', { username: 'viewer', password: 'observer-control-password' })).headers['set-cookie'][0].split(';')[0];
  assert.equal((await call(url, home, observer)).status, 403);
  assert.equal(published.filter(item => item.security || item.print).length, 0);
  const imported = await call('/api/cloud-certificates', { key: app.key, chain: app.cert, crl: '-----BEGIN X509 CRL-----\nYQ==\n-----END X509 CRL-----\n' }, admin);
  assert.equal(imported.status, 200);
  const result = await call(url, home, admin); assert.equal(result.status, 200); assert.equal(result.body.outcome, 'accepted');
  const control = published.find(item => item.print); assert.ok(control.header); assert.ok(control.print.param_enc);
  assert.equal(privateDecrypt({ key: printer.key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(control.print.param_enc, 'base64')).toString(), 'G28\n');
  const logs = (await call(`/api/cloud-accounts/${account.id}/logs`, undefined, admin)).body;
  assert.doesNotMatch(JSON.stringify(logs), /PRIVATE KEY|BEGIN CERTIFICATE|FAKE-CLOUD-TOKEN|ABCD1234/);
  await call(`/api/cloud-accounts/${account.id}/disconnect`, {}, admin);
  const count = published.length;
  assert.equal((await call(url, home, admin)).status >= 400, true); assert.equal(published.length, count);
});
