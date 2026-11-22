import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import type { MqttClient } from 'mqtt';
import { createCC2Services } from '../src/monitor.ts';

const machine = { id: 'cc2', serial: 'CC2LIFE', origin: 'mqtt://192.168.1.60:1883', accessCode: 'test-only' };
const api = createCC2Services({ readResponse: async response => response.json() as Promise<unknown>, reportedControls: () => ({}), canvasFilaments: () => null });

test('CC2 : après fermeture, aucun appel tardif ne relance identification ni session', async () => {
  let identifications = 0, connections = 0;
  const client = Object.assign(new EventEmitter(), { connected: false, end() { client.emit('close'); }, subscribe() {}, publish() {} });
  const monitor = api.createElegooMonitor({
    fetcher: async () => { identifications += 1; return Response.json({ system_info: { sn: machine.serial } }); },
    connectPrinter: () => { connections += 1; return client as unknown as MqttClient; },
  });
  await monitor.read(machine);
  await setImmediate();
  assert.equal(identifications, 1);
  assert.equal(connections, 1);
  monitor.close();
  assert.deepEqual(await monitor.read(machine), { status: 'offline', issue: 'elegoo-connection', nozzle: null, bed: null, progress: 0, file: '' });
  await setImmediate();
  assert.equal(identifications, 1, 'pas de nouvelle identification HTTP');
  assert.equal(connections, 1, 'pas de nouvelle session MQTT');
  assert.throws(() => monitor.request(machine, 1028, {}), /elegoo-connection/);
});

test('CC2 : une fermeture pendant l’identification n’ouvre pas de session', async () => {
  let release!: () => void, connections = 0;
  const monitor = api.createElegooMonitor({
    fetcher: () => new Promise<Response>(resolve => { release = () => resolve(Response.json({ system_info: { sn: machine.serial } })); }),
    connectPrinter: () => { connections += 1; throw new Error('unexpected'); },
  });
  await monitor.read(machine);
  monitor.close();
  release();
  await setImmediate(); await setImmediate();
  assert.equal(connections, 0);
});
