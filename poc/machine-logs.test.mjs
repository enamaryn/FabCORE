import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMachineLogs, instrumentConnector, safeMachineDetails } from './machine-logs.mjs';
import { safeCloudPayload } from './cloud-accounts.mjs';

const id = '12345678-1234-1234-1234-123456789012';
test('journal machine : isolation, rotation, secrets, persistance et suppression', ctx => {
  const directory = mkdtempSync(join(tmpdir(), 'fabcore-logs-'));
  ctx.after(() => rmSync(directory, { recursive: true, force: true }));
  const options = { directory, machines: () => [{ id, accessCode: 'PRIVATE_LAN' }], limit: 100 };
  const journal = createMachineLogs(options);
  journal.record(id, 'protocol', 'mqtt-send', { payload: { print: { command: 'gcode_line', param: 'M104 S100' } }, reason: 'PRIVATE_LAN', password: 'PRIVATE_PASSWORD' });
  journal.record(id, 'protocol', 'mqtt-command-response', { payload: { print: { result: 'fail', reason: 'denied', code: 7, sequence_id: '12' } } });
  const content = createMachineLogs(options).read(id);
  assert.match(content, /M104 S100/); assert.match(content, /denied/); assert.match(content, /sequence_id/);
  assert.doesNotMatch(content, /PRIVATE/);
  assert.equal(statSync(join(directory, 'machine-logs', id + '.log')).mode & 0o777, 0o600);
  assert.throws(() => journal.read('../other'), /missing/);
  journal.record('../other', 'protocol', 'ignored');
  journal.forget(id); assert.equal(journal.read(id), '');
});
test('journal machine : une panne de stockage ne bloque ni commande ni résultat', ctx => {
  const directory = mkdtempSync(join(tmpdir(), 'fabcore-logs-'));
  ctx.after(() => rmSync(directory, { recursive: true, force: true }));
  const journal = createMachineLogs({ directory, machines: () => [{ id }] });
  mkdirSync(join(directory, 'machine-logs', id + '.log'));
  assert.doesNotThrow(() => journal.record(id, 'control', 'send'));
  assert.throws(() => journal.read(id), /logs-unavailable/);
});
test('journal connecteur : une seule exécution, résultat natif et erreur sans exception sensible', async () => {
  const lines = []; let calls = 0;
  const connector = instrumentConnector({ control: { execute: async () => { calls++; return { confirmed: false, outcome: 'rejected' }; } },
    read: async () => { throw new Error('password=PRIVATE'); } }, { trace: (...args) => lines.push(args) });
  const machine = { id, origin: 'mqtts://192.168.1.10:8883' };
  assert.equal((await connector.control.execute(machine, { id: 'nozzle', value: 100 })).confirmed, false);
  assert.equal(calls, 1); assert.equal(lines[0][2].host, '192.168.1.10');
  assert.equal(lines[1][2].outcome, 'rejected');
  await assert.rejects(connector.read(machine), /PRIVATE/);
  assert.doesNotMatch(JSON.stringify(lines), /PRIVATE/);
});
test('cloud verbose : conserve les champs inconnus et identités, expurge les secrets imbriqués', () => {
  const safe = safeCloudPayload({ new_field: { device: 'P2S', dev_id: 'SERIAL', print_status: 'FAIL', firmware_flag: 19,
    ttcode: 'PRIVATE_CAMERA', dev_access_code: 'PRIVATE_LAN', accessToken: 'PRIVATE_TOKEN', code: '123456', error: { code: 803 }, echo: 'PRIVATE_PASSWORD' },
    url: 'https://example.test/?token=PRIVATE_TOKEN' }, ['PRIVATE_PASSWORD']);
  assert.equal(safe.new_field.firmware_flag, 19); assert.equal(safe.new_field.error.code, 803);
  assert.equal(safe.new_field.dev_id, 'SERIAL'); assert.equal(safe.new_field.print_status, 'FAIL');
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE|123456/);
});
test('journal machine : le message Klipper (nativeMessage) est conservé, les secrets restent masqués', () => {
  const safe = safeMachineDetails({ operation: 'read', status: 'error', issue: 'print', nativeMessage: 'Unknown command:"PRINT_START" api_key=PRIVATE', apiKey: 'PRIVATE' });
  assert.match(safe.nativeMessage, /Unknown command:"PRINT_START"/);
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE/);
});
