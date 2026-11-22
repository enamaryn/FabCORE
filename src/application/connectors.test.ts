import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectorCatalog } from '../../poc/connectors.mjs';
import { connectorManifest, connectorManifests, createTypedConnectorRegistry, normalizeTelemetry } from './connectors.ts';

const at = new Date('2026-11-22T10:00:00.000Z');
const machine = { id: '3f1c2b9e-4d5a-4b6c-8d7e-9f0a1b2c3d4e', origin: 'mqtt://192.168.1.20:1883' };
const commandId = '7a1c2b9e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

function fakeRegistry(connector: Record<string, unknown>) {
  const calls = { get: 0, forget: [] as unknown[], close: 0 };
  return {
    calls,
    registry: {
      async get() { calls.get += 1; return connector as never; },
      forget(kind: string, id: string, changed: boolean) { calls.forget.push([kind, id, changed]); },
      close() { calls.close += 1; },
    },
  };
}

test('chaque connecteur du POC a un manifeste valide qui conserve capacités et temporisations', () => {
  const manifests = connectorManifests();
  assert.deepEqual(manifests.map(({ id }) => id), Object.keys(connectorCatalog));
  const elegoo = connectorManifest('elegoo');
  assert.deepEqual(elegoo.timing, { live: false, interval: 7000, verify: true });
  assert.deepEqual(elegoo.capabilities.commandActions, ['pause', 'stop'], 'la CC2 ne déclare pas de reprise');
  assert.deepEqual(connectorManifest('bambu').timing, { live: true, interval: null, verify: false });
  assert.equal(connectorManifest('octoprint').timing.interval, 5000);
  assert.equal(connectorManifest('octoprint').credentialsRequired, true);
  assert.equal(connectorManifest('klipper').port, 7125);
  assert.equal(connectorManifest('bambu').port, null);
  assert.throws(() => connectorManifest('inexistant'), /connector\.unknown/);
});

test('une lecture du POC est normalisée sans inventer de valeur', () => {
  assert.deepEqual(normalizeTelemetry(machine.id, { status: 'offline', issue: 'connection', progress: 0, nozzle: null, bed: null, file: '' }, at), {
    machineId: machine.id, at: at.toISOString(), status: 'offline', issue: 'connection', nozzle: null, bed: null, progress: null, file: null,
  });
  const printing = normalizeTelemetry(machine.id, { status: 'printing', issue: null, progress: 42.5, nozzle: 215, bed: 60, file: 'cube.gcode', serial: 'X' }, at);
  assert.equal(printing.progress, 42.5);
  assert.equal(printing.file, 'cube.gcode');
  assert.equal('serial' in printing, false, 'les champs hors contrat ne sont pas transmis');
  const odd = normalizeTelemetry(machine.id, { status: 'busy', issue: 'Connexion perdue', progress: 140, nozzle: Number.NaN, bed: '60' }, at);
  assert.equal(odd.status, 'unknown');
  assert.equal(odd.issue, 'connector.issue-unrecognized');
  assert.equal(odd.progress, null);
  assert.equal(odd.nozzle, null);
  assert.equal(odd.bed, null);
  assert.equal(odd.file, null);
});

test('le registre typé réutilise une seule instance et normalise les lectures', async () => {
  const { registry, calls } = fakeRegistry({ async read() { return { status: 'ready', issue: null, progress: 0, nozzle: 25, bed: 24, file: '' }; } });
  const typed = createTypedConnectorRegistry({}, registry, () => at);
  const cc2 = typed.connector('elegoo');
  await cc2.open();
  const telemetry = await cc2.read(machine);
  assert.equal(telemetry.status, 'ready');
  assert.equal(telemetry.file, null);
  assert.equal(calls.get, 2, 'chaque appel passe par le registre du POC, qui garde une seule instance');
  cc2.forget(machine.id, true);
  assert.deepEqual(calls.forget, [['elegoo', machine.id, true]]);
  typed.close();
  assert.equal(calls.close, 1);
});

test('une commande est émise une seule fois et son issue reste au mieux acceptée', async () => {
  const sent: string[] = [];
  const outcomes: unknown[] = [true, false, new Error('timeout'), new Error('bambu-authorization')];
  const { registry } = fakeRegistry({
    async read() { return {}; },
    async command(_machine: unknown, action: string) {
      sent.push(action);
      const next = outcomes.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  });
  const p2s = createTypedConnectorRegistry({}, registry, () => at).connector('bambu');
  assert.deepEqual(await p2s.command(machine, 'pause', commandId), { commandId, outcome: 'accepted', at: at.toISOString() });
  assert.deepEqual((await p2s.command(machine, 'pause', commandId)).error, { code: 'command.rejected' });
  const lost = await p2s.command(machine, 'stop', commandId);
  assert.equal(lost.outcome, 'unknown');
  assert.deepEqual(lost.error, { code: 'command.unconfirmed' });
  const refused = await p2s.command(machine, 'resume', commandId);
  assert.equal(refused.outcome, 'rejected');
  assert.deepEqual(refused.error, { code: 'bambu-authorization' });
  assert.deepEqual(sent, ['pause', 'pause', 'stop', 'resume'], 'aucun rejeu après une perte de réponse');
});

test('une action non déclarée est refusée sans contacter la machine', async () => {
  let called = false;
  const { registry, calls } = fakeRegistry({ async read() { return {}; }, async command() { called = true; return true; } });
  const typed = createTypedConnectorRegistry({}, registry, () => at);
  const resume = await typed.connector('elegoo').command(machine, 'resume', commandId);
  assert.equal(resume.outcome, 'rejected');
  assert.deepEqual(resume.error, { code: 'command.unsupported' });
  const start = await typed.connector('bambu').command(machine, 'start', commandId);
  assert.equal(start.outcome, 'rejected');
  assert.equal(called, false);
  assert.equal(calls.get, 0);
});
