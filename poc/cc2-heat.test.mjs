import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { createElegooMonitor } from './elegoo.mjs';
import { createConnectorRegistry } from './connectors.mjs';

test('CC2 : registre, chauffe 1028 corrélée, retour de consigne et session unique sans rejeu', async () => {
  const machine = { id: 'cc2', kind: 'elegoo', serial: 'CC2HEAT01', origin: 'mqtt://192.168.1.2:1883', accessCode: 'test-only' };
  const client = new EventEmitter(); client.connected = true;
  let connections = 0, clock = Date.now(), response, refuse = false;
  const commands = [];
  const deliver = (topic, data, retain = false) => client.emit('message', topic, Buffer.from(JSON.stringify(data)), { retain });
  client.subscribe = (_topics, done) => done(null, [{ qos: 0 }, { qos: 0 }, { qos: 0 }]);
  client.end = () => {};
  client.publish = (topic, payload, options, callback) => {
    const data = JSON.parse(payload);
    if (topic.endsWith('/api_register')) deliver(`elegoo/${machine.serial}/${data.request_id}/register_response`, { error: 'ok' });
    else if (data.method === 1002) deliver(response, { id: data.id, method: 1002, result: { machine_status: { status: 1 }, extruder: { temperature: 22, target: 0 }, heater_bed: { temperature: 20, target: 0 } } });
    else if (data.method === 1028) {
      commands.push(data);
      assert.deepEqual(options, { qos: 0, retain: false });
      callback();
      queueMicrotask(() => {
        deliver(response, { id: data.id, method: 1029, result: { error_code: 0 } });
        deliver(response, { id: data.id + 100, method: 1028, result: { error_code: 0 } });
        deliver(response, { id: data.id, method: 1028, result: { error_code: 0 } }, true);
        deliver(response, { id: data.id, method: 1028, result: { error_code: refuse ? 1003 : 0 } });
        if (!refuse) deliver(`elegoo/${machine.serial}/api_status`, { method: 6000, result: { heater_bed: { target: data.params.heater_bed } } });
      });
    }
  };
  const monitor = createElegooMonitor({ now: () => clock, fetcher: async () => Response.json({ system_info: { sn: machine.serial } }),
    connectPrinter(_url, options) { connections++; response = `elegoo/${machine.serial}/${options.clientId}/api_response`; queueMicrotask(() => client.emit('connect')); return client; } });
  const registry = createConnectorRegistry({}, () => ({ controls: true, load: async () => ({ ...monitor }) }));
  try {
    const connector = await registry.get('elegoo');
    await connector.read(machine); await setImmediate();
    const state = await connector.control.read(machine);
    assert.equal(state.heaters[1].writable, true);
    assert.deepEqual(await connector.control.execute(machine, { action: 'heat', id: 'bed', value: 60 }, state), { outcome: 'confirmed' });
    assert.deepEqual(commands[0].params, { heater_bed: 60 });
    assert.equal((await connector.control.read(machine)).heaters[0].target, 0);
    refuse = true;
    assert.deepEqual(await connector.control.execute(machine, { action: 'heat', id: 'bed', value: 0 }, state), { outcome: 'rejected' });
    assert.equal(commands.length, 2); assert.notEqual(commands[0].id, commands[1].id); assert.equal(connections, 1);
    clock += 31000;
    assert.deepEqual((await connector.control.read(machine)).heaters, [], 'pas de consigne périmée pour confirmer une action');
    client.emit('close');
    assert.deepEqual((await connector.control.read(machine)).heaters, []);
    assert.throws(() => connector.request(machine, 1028, { heater_bed: 60 }), /elegoo-connection/);
    assert.equal(commands.length, 2);
  } finally { registry.close(); }
});
