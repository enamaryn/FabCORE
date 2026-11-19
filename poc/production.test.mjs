import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { tmpdir } from 'node:os';
import { setImmediate } from 'node:timers/promises';
import { createBambuMonitor } from './bambu.mjs';
import { createBambuFiles } from './bambu-files.mjs';
import { createElegooMonitor } from './elegoo.mjs';
import { createElegooFiles } from './elegoo-files.mjs';
import { requestElegooCC1 } from './elegoo-cc1.mjs';
import { commandOctoPrint } from './octoprint.mjs';
import { createPrusaOperations } from './prusalink.mjs';
import { retainedFiles, projectGcode, productionPath } from './production-files.mjs';
import { createGcodeParser, EXTRUDE, TRAVEL } from './gcode.mjs';

test('Bambu : commandes corrélées sur la session existante, sans mise en file hors ligne', async () => {
  const client = new EventEmitter();
  client.connected = true;
  client.subscribe = (_topic, done) => done(null, [{ qos: 0 }]);
  client.end = () => {};
  const sent = [];
  client.publish = (_topic, payload, options, callback) => {
    const data = JSON.parse(payload);
    if (!data.print) return;
    assert.deepEqual(options, { qos: 0, retain: false });
    sent.push(data.print);
    callback();
    queueMicrotask(() => {
      client.emit('message', 'device/TESTP2S123/report', Buffer.from(JSON.stringify({ print: { ...data.print, sequence_id: 'wrong', result: 'success' } })));
      client.emit('message', 'device/TESTP2S123/report', Buffer.from(JSON.stringify({ print: { ...data.print, result: data.print.command === 'stop' ? 'fail' : 'success' } })));
    });
  };
  let connections = 0;
  const monitor = createBambuMonitor((_url, options) => {
    connections++; assert.equal(options.queueQoSZero, false); return client;
  });
  const machine = { id: 'one', origin: 'mqtts://192.168.1.2:8883', serial: 'TESTP2S123', accessCode: '12345678' };
  try {
    monitor.read(machine); client.emit('connect');
    client.emit('message', 'device/TESTP2S123/report', Buffer.from(JSON.stringify({ print: { command: 'push_status', gcode_state: 'RUNNING' } })));
    assert.equal(await monitor.command(machine, 'pause'), true);
    assert.equal(await monitor.command(machine, 'stop'), false);
    client.connected = false;
    await assert.rejects(monitor.command(machine, 'resume'));
    assert.equal(sent.length, 2); assert.equal(connections, 1);
  } finally { monitor.close(); }
});

test('CC2 : commandes MQTT corrélées et session conservée', async () => {
  const client = new EventEmitter(); client.connected = true;
  const machine = { id: 'one', origin: 'mqtt://192.168.1.2:1883', serial: 'CC2TEST01', accessCode: '123456' };
  let reply, connections = 0;
  const methods = [];
  const deliver = (topic, data) => client.emit('message', topic, Buffer.from(JSON.stringify(data)));
  client.subscribe = (_topics, done) => done(null, [{ qos: 0 }, { qos: 0 }, { qos: 0 }]);
  client.end = () => {};
  client.publish = (topic, payload) => {
    const data = JSON.parse(payload);
    if (topic.endsWith('/api_register')) deliver(`elegoo/CC2TEST01/${data.request_id}/register_response`, { error: 'ok' });
    else if (data.method === 1002) deliver(reply, { id: data.id, result: { machine_status: { status: 2 } } });
    else if (data.method >= 1020 && data.method <= 1022) {
      methods.push(data.method);
      queueMicrotask(() => deliver(reply, { id: data.id, method: data.method, result: { error_code: data.method === 1022 ? 1003 : 0 } }));
    }
  };
  const monitor = createElegooMonitor({ fetcher: async () => Response.json({ system_info: { sn: machine.serial } }),
    connectPrinter(_url, options) { connections++; reply = `elegoo/CC2TEST01/${options.clientId}/api_response`; queueMicrotask(() => client.emit('connect')); return client; } });
  try {
    await monitor.read(machine); await setImmediate();
    assert.equal(await monitor.command(machine, 'pause'), true);
    assert.equal(await monitor.command(machine, 'stop'), false);
    assert.equal(await monitor.command(machine, 'resume'), false, 'la reprise absente du SDK ne doit pas être inventée');
    assert.equal(connections, 1); assert.deepEqual(methods, [1021, 1022]);
  } finally { monitor.close(); }
});

test('CC1 : ignore les réponses étrangères et vérifie le refus SDCP', async () => {
  class Socket extends EventTarget {
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    close() {}
    send(payload) {
      const { Data } = JSON.parse(payload);
      assert.equal(Data.Cmd, 130);
      const response = RequestID => new MessageEvent('message', { data: JSON.stringify({ Topic: 'sdcp/response/CC1TEST01', Data: { Cmd: Data.Cmd, RequestID, Data: { Ack: 1 } } }) });
      this.dispatchEvent(response('other'));
      this.dispatchEvent(response(Data.RequestID));
    }
  }
  assert.equal(await requestElegooCC1({ serial: 'CC1TEST01', origin: 'ws://192.168.1.2:3030' }, 130, {}, { Socket }), false);
});

test('Elegoo : transfert CC2 en tranches authentifiées, jamais de lancement à l’envoi', async () => {
  const bytes = Buffer.alloc(1024 * 1024 + 7, 65);
  const ranges = [];
  const files = createElegooFiles(() => assert.fail('upload must not start'), { fetcher: async (url, options) => {
    assert.equal(url, 'http://192.168.1.2/upload'); assert.equal(options.method, 'PUT');
    assert.equal(options.headers['X-Token'], 'test-token'); assert.match(options.headers['X-File-MD5'], /^[a-f0-9]{32}$/);
    ranges.push(options.headers['Content-Range']);
    return Response.json({ error_code: 0 });
  } });
  assert.equal(await files.upload({ origin: 'mqtt://192.168.1.2:1883', accessCode: 'test-token' }, 'cube.gcode', Readable.from([bytes]), bytes.length), 'cube.gcode');
  assert.deepEqual(ranges, ['bytes 0-1048575/1048583', 'bytes 1048576-1048582/1048583']);
});

test('Bambu : FTPS implicite avec identité TLS, et chemin projet exact', async () => {
  const calls = [];
  let closed = 0;
  const files = createBambuFiles(async (...args) => { calls.push(args); return true; }, () => ({
    async access(options) { assert.equal(options.port, 990); assert.equal(options.secure, 'implicit'); assert.equal(options.secureOptions.rejectUnauthorized, true); },
    async list(path) { return path === '/' ? [{ name: 'cube.gcode', isFile: true, size: 12 }] : []; },
    close() { closed++; }
  }));
  const machine = { origin: 'mqtts://192.168.1.2:8883', serial: 'TESTP2S123', accessCode: '12345678' };
  assert.deepEqual(await files.list(machine), [{ path: 'cube.gcode', size: 12, modified: null }]);
  assert.equal(closed, 1);
  await files.start(machine, 'cube.3mf', 'Metadata/plate_2.gcode');
  assert.equal(calls[0][1], 'project_file');
  assert.equal(calls[0][2].param, 'Metadata/plate_2.gcode');
  assert.equal(calls[0][2].use_ams, false);
});

test('PrusaLink et OctoPrint : commandes natives, stockage réel et cible de téléchargement confinée', async () => {
  const calls = [];
  let badRef = false;
  const fetcher = async (url, options = {}) => {
    calls.push([url, options.method ?? 'GET', options.body]);
    if (url.endsWith('/api/v1/job')) return Response.json({ id: 7 });
    if (url.endsWith('/api/v1/storage')) return Response.json({ storage_list: [{ path: '/usb', available: true, read_only: false }] });
    if (url.endsWith('/api/v1/files/usb/')) return Response.json({ children: [{ name: 'cube.gcode', type: 'PRINT_FILE', size: 12, m_timestamp: 1 }] });
    if (url.endsWith('/api/v1/files/usb/cube.gcode') && !options.method) return Response.json({ refs: { download: badRef ? 'http://192.168.1.99/private' : '/usb/cube.gcode' } });
    if (url.endsWith('/usb/cube.gcode')) return new Response('G1 X1');
    return new Response(null, { status: 204 });
  };
  const machine = { origin: 'http://192.168.1.2', apiKey: 'test-key' };
  const operations = createPrusaOperations(fetcher);
  assert.equal(await operations.command(machine, 'stop'), true);
  assert.deepEqual(calls.at(-1).slice(0, 2), [machine.origin + '/api/v1/job/7', 'DELETE']);
  assert.deepEqual(await operations.files.list(machine), [{ path: 'usb/cube.gcode', size: 12, modified: 1000 }]);
  assert.equal(await (await operations.files.download(machine, 'usb/cube.gcode')).text(), 'G1 X1');
  badRef = true; await assert.rejects(operations.files.download(machine, 'usb/cube.gcode'));
  assert.equal(await commandOctoPrint(machine, 'resume', fetcher), true);
  assert.deepEqual(JSON.parse(calls.at(-1)[2]), { command: 'pause', action: 'resume' });
  assert.equal(await commandOctoPrint(machine, 'stop', fetcher), true);
  assert.deepEqual(JSON.parse(calls.at(-1)[2]), { command: 'cancel' });
});

test('Fichiers retenus : persistants, isolés, sans fichier fantôme après refus', async ctx => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-retained-'));
  ctx.after(() => rm(directory, { recursive: true, force: true }));
  let accepted = false;
  const native = { async upload(_machine, _name, source) { for await (const _chunk of source) {} return accepted ? 'cube.gcode' : null; }, start: async () => true };
  let files = retainedFiles(directory, native);
  const machine = { id: 'one', origin: 'mqtt://192.168.1.2:1883', serial: 'CC2TEST01' };
  const send = () => files.upload(machine, 'cube.gcode', Readable.from(['G1 X1']), 5);
  assert.equal(await send(), null); assert.deepEqual(await files.list(machine), []);
  accepted = true; await send();
  files = retainedFiles(directory, native);
  assert.equal((await files.list(machine))[0].path, 'cube.gcode');
  assert.equal(await (await files.download(machine, 'cube.gcode')).text(), 'G1 X1');
  assert.deepEqual(await files.list({ ...machine, id: 'other' }), []);
  await assert.rejects(send(), /file-exists/);
  await assert.rejects(files.upload(machine, '../cube.gcode', Readable.from(['G1']), 2));
});

// Minimal ZIP container with central directory, sufficient to exercise bounds/plate selection.
function project(names) {
  const locals = [], entries = []; let offset = 0;
  for (const name of names) {
    const filename = Buffer.from(name), bytes = Buffer.from('G1 X1 E1\n');
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50);
    central.writeUInt32LE(crc32(bytes), 16); central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    const local = Buffer.concat([head, filename, bytes]); locals.push(local); entries.push(Buffer.concat([central, filename])); offset += local.length;
  }
  const central = Buffer.concat(entries), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(names.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

test('3MF : lit un seul plateau tranché, rejette archives ambiguës et chemins traversants', async ctx => {
  const directory = await mkdtemp(join(tmpdir(), 'fabcore-project-')); ctx.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'project.3mf');
  await writeFile(path, project(['Metadata/plate_2.gcode']));
  const entry = await projectGcode(path); assert.equal(entry.name, 'Metadata/plate_2.gcode'); assert.equal(entry.bytes.toString(), 'G1 X1 E1\n');
  await writeFile(path, project(['Metadata/plate_1.gcode', 'Metadata/plate_2.gcode'])); await assert.rejects(projectGcode(path), /multiple-plates/);
  await writeFile(path, project(['3D/model.model'])); await assert.rejects(projectGcode(path), /no-gcode/);
  await writeFile(path, Buffer.from('broken')); await assert.rejects(projectGcode(path), /project-format/);
  assert.equal(productionPath('../a.3mf'), null); assert.equal(productionPath('/a.3mf'), null); assert.equal(productionPath('cache/a.3mf'), 'cache/a.3mf');
});

test('Visualiseur laser : M3/M4, puissance nulle, M5 et déplacements rapides', () => {
  const parser = createGcodeParser({ laser: true });
  parser.write('M4 S100\nG1 X10\nG0 X20\nG1 X30 S0\nG1 X40 S50\nM5\nG1 X50\n');
  assert.deepEqual([...parser.finish().types], [EXTRUDE, TRAVEL, TRAVEL, EXTRUDE, TRAVEL]);
});
