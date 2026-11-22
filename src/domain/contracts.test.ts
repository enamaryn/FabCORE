import assert from 'node:assert/strict';
import { test } from 'node:test';
import Value from 'typebox/value';
import { connectorCatalog } from '../../poc/connectors.mjs';
import { Capabilities, Command, CommandResult, DomainEvent, FabError, Machine, Telemetry, isEffectProven, mergeOutcome, restrictCapabilities } from './index.ts';

const id = '3f1c2b9e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
const at = '2026-11-22T10:00:00.000Z';

test('les capacités déclarées par chaque connecteur du POC respectent le contrat', () => {
  for (const [kind, entry] of Object.entries(connectorCatalog)) {
    const { model, form, port, required, ...capabilities } = entry as Record<string, unknown>;
    assert.ok(Value.Check(Capabilities, capabilities), `${kind} : ${JSON.stringify([...Value.Errors(Capabilities, capabilities)].slice(0, 2))}`);
  }
});

test('une fiche modèle restreint les capacités sans jamais en ajouter', () => {
  const base = { camera: false, commands: true, commandActions: ['pause', 'stop'], files: true, retainedOnly: false, projects: false, externalFilament: false, terminal: false, filaments: null, temperatures: true, printJob: true, controls: false, fileFamily: 'fdm' } satisfies Capabilities;
  const result = restrictCapabilities(base, { camera: true, commandActions: ['pause', 'resume'], files: false, filaments: 'AMS' });
  assert.equal(result.camera, false);
  assert.deepEqual(result.commandActions, ['pause']);
  assert.equal(result.files, false);
  assert.equal(result.filaments, null);
  assert.equal(restrictCapabilities(base, { retainedOnly: true }).retainedOnly, true);
});

test('la télémétrie garde inconnues les valeurs non remontées', () => {
  const unknown = { machineId: id, at, status: 'unknown', issue: null, nozzle: null, bed: null, progress: null, file: null };
  assert.ok(Value.Check(Telemetry, unknown));
  assert.equal(Value.Check(Telemetry, { ...unknown, file: '' }), false, 'un fichier inconnu est null, pas une chaîne vide');
  assert.equal(Value.Check(Telemetry, { ...unknown, progress: 101 }), false);
  assert.equal(Value.Check(Telemetry, { ...unknown, status: 'busy' }), false);
  assert.equal(Value.Check(Telemetry, { ...unknown, issue: 'Connexion perdue' }), false, 'pas de texte affiché, un code');
});

test('une machine a un seul transport LAN ou cloud', () => {
  const machine = { id, name: 'CC2 atelier', connector: 'elegoo', transport: 'lan', serial: null, model: null, firmware: null };
  assert.ok(Value.Check(Machine, machine));
  assert.equal(Value.Check(Machine, { ...machine, transport: 'auto' }), false);
  assert.equal(Value.Check(Machine, { ...machine, transport: ['lan', 'cloud'] }), false);
});

test('les commandes et résultats distinguent accepté, confirmé et inconnu', () => {
  assert.ok(Value.Check(Command, { id, machineId: id, action: 'stop', requestedBy: 'admin', requestedAt: at, confirmed: true }));
  assert.equal(Value.Check(Command, { id, machineId: id, action: 'home', requestedBy: 'admin', requestedAt: at, confirmed: true }), false);
  assert.ok(Value.Check(CommandResult, { commandId: id, outcome: 'unknown', at, error: { code: 'command.timeout' } }));
  assert.equal(isEffectProven('accepted'), false);
  assert.equal(isEffectProven('unknown'), false);
  assert.equal(isEffectProven('confirmed'), true);
  assert.equal(mergeOutcome('confirmed', 'accepted'), 'confirmed');
  assert.equal(mergeOutcome('accepted', 'unknown'), 'accepted');
  assert.equal(mergeOutcome('accepted', 'confirmed'), 'confirmed');
  assert.equal(mergeOutcome('rejected', 'confirmed'), 'rejected');
  assert.equal(mergeOutcome('accepted', 'rejected'), 'rejected');
  assert.equal(mergeOutcome('executed', 'rejected'), 'executed');
});

test('les erreurs et événements transportent des codes, pas de texte affiché', () => {
  assert.ok(Value.Check(FabError, { code: 'machine.offline', params: { machine: 'CC2' }, detail: 'raw firmware message' }));
  assert.equal(Value.Check(FabError, { code: 'Machine hors ligne' }), false);
  assert.ok(Value.Check(DomainEvent, { id: '42', type: 'resync', at, data: {} }));
  assert.ok(Value.Check(DomainEvent, { id: '43', type: 'command.result', at, data: { commandId: id, outcome: 'accepted', at } }));
  assert.equal(Value.Check(DomainEvent, { id: '44', type: 'command.result', at, data: { commandId: id, outcome: 'success', at } }), false);
});
