import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createElegooMonitor, elegooClientId, readElegoo } from './elegoo.mjs';
import { readElegooCC1 } from './elegoo-cc1.mjs';

const cc2 = { origin: 'mqtt://192.168.1.51:1883', accessCode: 'Test123' };
const identify = (serial) => async (url, options) => {
  assert.equal(url.pathname, '/system/info');
  assert.equal(url.searchParams.get('X-Token'), cc2.accessCode);
  assert.equal(options.redirect, 'error');
  return Response.json({ system_info: { sn: serial } });
};

test('CC2 enregistre une session et demande exclusivement le statut 1002', async () => {
  const client = new EventEmitter();
  const serial = 'CC2TEST01';
  let publications = 0;
  let closed = false;
  client.end = () => { closed = true; };
  const connectPrinter = (origin, { clientId, username, password }) => {
    assert.equal(origin, cc2.origin);
    assert.equal(username, 'elegoo');
    assert.equal(password, cc2.accessCode);
    const root = `elegoo/${serial}`;
    const response = `${root}/${clientId}/api_response`;
    client.subscribe = (topics, callback) => {
      assert.deepEqual(topics, [`${root}/${clientId}_req/register_response`, response]);
      callback(null, [{ qos: 0 }, { qos: 0 }]);
    };
    const deliver = (topic, message) => client.emit('message', topic, Buffer.from(JSON.stringify(message)));
    client.publish = (topic, payload) => {
      publications++;
      const data = JSON.parse(payload);
      if (topic === `${root}/api_register`) {
        assert.deepEqual(data, { client_id: clientId, request_id: `${clientId}_req` });
        return deliver(`${root}/${clientId}_req/register_response`, { error: 'ok' });
      }
      assert.equal(topic, `${root}/${clientId}/api_request`);
      assert.deepEqual(data, { id: 1, method: 1002, params: {} });
      const result = { machine_status: { status: 2, sub_status: 2502, progress: 52 },
        extruder: { temperature: 214.54 }, heater_bed: { temperature: 60 }, print_status: { filename: 'part.gcode' } };
      deliver(response, { id: 1, method: 6000, result: {} });
      deliver(response, { id: 1, result });
    };
    queueMicrotask(() => client.emit('connect'));
    return client;
  };
  const state = await readElegoo(cc2, { fetcher: identify(serial), connectPrinter });
  assert.deepEqual(state, { status: 'paused', issue: null, progress: 52, nozzle: 214.5, bed: 60, file: 'part.gcode', serial });
  assert.equal(publications, 2);
  assert.ok(closed);
});

test('CC2 bloque une identité différente après un changement d’adresse', async () => {
  const connectPrinter = () => assert.fail('Aucune connexion MQTT ne doit être ouverte');
  const state = await readElegoo({ ...cc2, serial: 'CC2TEST01' }, { fetcher: identify('CC2TEST02'), connectPrinter });
  assert.equal(state.issue, 'elegoo-identity');
});

test('CC1 interroge le statut SDCP et ignore une autre identité', async () => {
  const serial = 'CC1TEST01';
  const calls = [];
  class Socket extends EventTarget {
    constructor(url) {
      super();
      assert.equal(url, 'ws://192.168.1.52:3030/websocket');
      queueMicrotask(() => this.dispatchEvent(new Event('open')));
    }
    send(payload) {
      const request = JSON.parse(payload);
      calls.push(request.Data.Cmd);
      assert.equal(request.Topic, `sdcp/request/${serial}`);
      assert.equal(request.Data.MainboardID, serial);
      const status = { PrintInfo: { Status: 13, Progress: 9, Filename: 'part.gcode' },
        TempOfNozzle: [255, 250.04], TempOfHotbed: 60 };
      for (const id of ['ANOTHERCC1', serial]) {
        this.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify({ Topic: `sdcp/status/${id}`, Status: status })
        }));
      }
    }
    close() { calls.push('closed'); }
  }
  const state = await readElegooCC1({ origin: 'ws://192.168.1.52:3030' }, { Socket,
    discoverPrinter: (host) => {
      assert.equal(host, '192.168.1.52');
      return serial;
    }
  });
  assert.deepEqual(state, { status: 'printing', issue: null, progress: 9, nozzle: 250, bed: 60, file: 'part.gcode', serial });
  assert.deepEqual(calls, [0, 'closed']);
});


test('CC2 utilise un identifiant MQTT stable pour chaque numéro de série', () => {
  assert.match(elegooClientId('CC2TEST01'), /^1_PC_[0-9]{9}$/);
  assert.equal(elegooClientId('CC2TEST01'), elegooClientId('CC2TEST01'));
  assert.notEqual(elegooClientId('CC2TEST01'), elegooClientId('CC2TEST02'));
});

test('CC2 conserve une session, applique les rapports et attend avant de se réinscrire', async () => {
  const serial = 'CC2TEST01';
  const machine = { ...cc2, id: 'test-1', serial };
  const clients = [];
  let clock = Date.now();
  const monitor = createElegooMonitor({
    now: () => clock,
    fetcher: identify(serial),
    connectPrinter(_, options) {
      const client = new EventEmitter();
      const root = 'elegoo/' + serial;
      const reply = root + '/' + options.clientId + '/api_response';
      client.deliver = (topic, data) => client.emit('message', topic, Buffer.from(JSON.stringify(data)));
      client.subscribe = (_, done) => done(null, [{ qos: 0 }, { qos: 0 }, { qos: 0 }]);
      client.publish = (topic) => {
        if (topic.endsWith('/api_register')) client.deliver(root + '/' + options.clientId + '_req/register_response', { error: 'ok' });
        else client.deliver(reply, { id: 1, result: { machine_status: { status: 1 }, extruder: { temperature: 21 } } });
      };
      client.end = () => { client.ended = true; };
      clients.push(client);
      queueMicrotask(() => client.emit('connect'));
      return client;
    }
  });
  try {
    assert.equal((await monitor.read(machine)).status, 'connecting');
    await setImmediate();
    assert.equal((await monitor.read(machine)).nozzle, 21);
    clients[0].deliver('elegoo/' + serial + '/api_status', { method: 6000, result: { extruder: { temperature: 22 } } });
    assert.equal((await monitor.read(machine)).nozzle, 22);
    assert.equal(clients.length, 1);
    clients[0].emit('close');
    assert.equal((await monitor.read(machine)).status, 'offline');
    assert.equal(clients.length, 1);
    clock += 16000;
    await monitor.read(machine);
    await setImmediate();
    assert.equal(clients.length, 2);
    assert.equal((await monitor.read(machine)).status, 'ready');
  } finally { monitor.close(); }
  assert.ok(clients.every((client) => client.ended));
});
