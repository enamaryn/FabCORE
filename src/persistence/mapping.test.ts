import assert from 'node:assert/strict';
import test from 'node:test';
import type { FabCoreState } from '../application/state-store.ts';
import { canonicalState, rowsToState, stateToRows } from './mapping.ts';
import { inspectState } from './import.ts';
import { sampleState } from './test-fixtures.ts';


test('aller-retour état ↔ lignes sans perte, champs inconnus et valeurs nulles compris', () => {
  const state = sampleState();
  assert.deepEqual(rowsToState(stateToRows(state)), state);
  const odd = { ...state, futureKey: [1, 2], machines: [{ ...state.machines[0]!, kind: 3, serial: null }] } as unknown as FabCoreState;
  assert.deepEqual(rowsToState(stateToRows(odd)), canonicalState(odd));
  assert.deepEqual(canonicalState({ version: 1, admin: null, machines: [] }), { version: 1, admin: null, machines: [], observers: [], cloudAccounts: [] });
  const rows = stateToRows(state);
  assert.equal(rows.machines[1]?.manual_spool?.name, 'PLA', 'bobine manuelle en colonne');
  assert.equal(rows.connections[2]?.settings.manualSpool, null, 'bobine retirée (null) conservée telle quelle');
  assert.equal(rows.machines[2]?.cloud_account_id, '44444444-4444-4444-8444-444444444444');
});

test('inspection : relations, doublons et format signalés sans valeur de champ', () => {
  assert.deepEqual(inspectState(sampleState()).anomalies, []);
  const state = sampleState();
  state.machines.push({ ...state.machines[1]!, id: '66666666-6666-4666-8666-666666666666' });
  state.machines.push({ id: 'pas-un-uuid', name: 'x', origin: 'http://192.168.1.99' });
  state.machines[0]!.cloudAccountId = '99999999-9999-4999-8999-999999999999';
  state.observers!.push({ username: 'atelier', salt: 'x', hash: 'y' });
  const { state: accepted, anomalies } = inspectState(state);
  assert.equal(accepted, null);
  assert.deepEqual(anomalies.map(item => item.code + '@' + item.path), [
    'account-duplicate@observers[1]', 'machine-cloud-account@machines[0].cloudAccountId',
    'machine-duplicate-origin@machines[4].origin', 'machine-duplicate-serial@machines[4].serial', 'machine-invalid@machines[5]',
  ]);
  assert.ok(!/CC2SERIAL|192\.168|"bb"/.test(JSON.stringify(anomalies)), 'aucune valeur de champ dans le rapport');
  assert.deepEqual(inspectState({ version: 2, machines: [] }).anomalies, [{ code: 'state-format', path: '$', blocking: true }]);
});
