import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectService } from './projects.ts';
import type { FabCoreState } from './state-store.ts';
const machineId = '11111111-1111-4111-8111-111111111111';
function harness() {
  let at = '2026-11-27T08:00:00.000Z', calls = 0, events = 0, fail = false;
  let report: Record<string, unknown> = { status: 'printing', file: 'bookmark.gcode' };
  let state: FabCoreState = { version: 1, admin: null, machines: [{ id: machineId, name: 'Machine test', origin: 'http://printer.invalid' }] };
  const store = { get state() { return state; }, save(next: FabCoreState) { state = next; } };
  const options = { store, now: () => at, persist: async (next: FabCoreState) => { if (fail) throw new Error('storage-unavailable'); store.save(next); }, readMachine: async () => { calls++; return report; }, changed: () => { events++; } };
  const service = createProjectService(options);
  const create = (title = 'Marque-page', scheduledStart = '2026-11-27T08:00:00.000Z') => service.saveWork(null, null, { title, machineId, estimatedMinutes: 20, scheduledStart }, 'atelier');
  return { store, service, create, now(value: string) { at = value; }, report(value: Record<string, unknown>) { report = value; }, fail() { fail = true; }, calls: () => calls, events: () => events, reopen: () => createProjectService(options) };
}
test('association explicite : fichier natif concordant, début inconnu préservé et métadonnées non falsifiables', async () => {
  const h = harness(), work = await h.create();
  await assert.rejects(h.service.beginExecution(work.id, { expectedRevision: 1, mode: 'observed', file: 'another.gcode', confirm: true }, 'atelier'), /execution-unavailable/);
  await assert.rejects(h.service.beginExecution(work.id, { expectedRevision: 1, mode: 'observed', file: 'bookmark.gcode', confirm: false }, 'atelier'), /execution-invalid/);
  const linked = await h.service.beginExecution(work.id, { expectedRevision: 1, mode: 'observed', file: 'bookmark.gcode', confirm: true }, 'atelier');
  assert.equal(linked.executions?.[0]?.startedAt, null, 'associer un travail déjà lancé ne fournit pas son heure de départ');
  assert.equal(linked.executions?.[0]?.plannedMinutes, 20);
  const edited = await h.service.saveWork(null, work.id, { expectedRevision: 2, notes: 'note opérateur', executions: [] }, 'atelier');
  assert.equal(edited.executions?.length, 1, 'le formulaire de métadonnées ne peut pas effacer les preuves');
  await assert.rejects(h.service.saveWork(null, work.id, { expectedRevision: 3, state: 'done' }, 'atelier'), /execution-active/);
  await assert.rejects(h.service.saveWork(null, work.id, { expectedRevision: 3, machineId: null }, 'atelier'), /execution-active/);
});
test('une fabrication active par machine, reprises après échec et heures réelles confirmées', async () => {
  const h = harness(), a = await h.create(), b = await h.create('Autre', '2026-11-27T08:20:00.000Z');
  const linked = await h.service.beginExecution(a.id, { expectedRevision: 1, mode: 'manual', startedAt: '2026-11-27T07:55:00Z', confirm: true }, 'atelier');
  assert.equal(h.calls(), 0, 'le mode déclaré ne commande ni ne consulte le matériel');
  await assert.rejects(h.service.beginExecution(b.id, { expectedRevision: 1, mode: 'manual', confirm: true }, 'atelier'), /execution-busy/);
  h.now('2026-11-27T08:15:00.000Z');
  const failed = await h.service.finishExecution(a.id, linked.executions![0]!.id, { expectedRevision: 2, confirm: true, outcome: 'failed', endedAt: '2026-11-27T08:15:00Z' }, 'atelier');
  assert.equal(failed.state, 'todo'); assert.equal(failed.executions?.[0]?.outcome, 'failed');
  assert.equal(Date.parse(failed.executions![0]!.endedAt!) - Date.parse(failed.executions![0]!.startedAt!), 20 * 60000);
  await h.service.beginExecution(a.id, { expectedRevision: 3, mode: 'manual', confirm: true }, 'atelier');
  assert.equal(h.service.list().work[0]?.executions?.length, 2, 'la nouvelle tentative garde la précédente');
});
test('observation seule : pause, déconnexion et fin native ne concluent jamais le résultat', async () => {
  const h = harness(), work = await h.create();
  const linked = await h.service.beginExecution(work.id, { expectedRevision: 1, mode: 'observed', file: 'bookmark.gcode', confirm: true }, 'atelier');
  const id = linked.executions![0]!.id;
  await h.service.observeExecution(machineId, { status: 'paused', file: 'bookmark.gcode' });
  assert.equal(h.service.list().work[0]?.executions?.[0]?.observation, 'paused');
  await h.service.observeExecution(machineId, { status: 'offline', file: '' });
  assert.equal(h.service.list().work[0]?.executions?.[0]?.observation, 'unknown');
  await h.service.observeExecution(machineId, { status: 'done', file: 'bookmark.gcode' });
  assert.equal(h.service.list().work[0]?.executions?.[0]?.observation, 'finish-reported');
  assert.equal(h.service.list().work[0]?.executions?.[0]?.outcome, 'active');
  const reopened = h.reopen(); assert.equal(reopened.list().work[0]?.executions?.[0]?.observation, 'unknown');
  await reopened.observeExecution(machineId, { status: 'printing', file: 'different.gcode' });
  await reopened.observeExecution(machineId, { status: 'printing', file: 'bookmark.gcode' });
  assert.equal(reopened.list().work[0]?.executions?.[0]?.observation, 'different-job', 'un nom qui revient ne prouve pas la même fabrication');
  assert.equal(reopened.list().work[0]?.executions?.[0]?.id, id);
});
test('heures invalides, début futur et fin avant début refusés ; fin inconnue ne devient pas zéro', async () => {
  const h = harness(), work = await h.create();
  await assert.rejects(h.service.beginExecution(work.id, { expectedRevision: 1, mode: 'manual', confirm: true, startedAt: '2026-02-31T00:00:00Z' }, 'atelier'), /execution-invalid/);
  const linked = await h.service.beginExecution(work.id, { expectedRevision: 1, mode: 'manual', confirm: true }, 'atelier');
  h.now('2026-11-27T08:20:00.000Z');
  await assert.rejects(h.service.finishExecution(work.id, linked.executions![0]!.id, { expectedRevision: 2, confirm: true, outcome: 'done', startedAt: '2026-11-27T08:21:00Z', endedAt: '2026-11-27T08:20:00Z' }, 'atelier'), /execution-invalid/);
  const done = await h.service.finishExecution(work.id, linked.executions![0]!.id, { expectedRevision: 2, confirm: true, outcome: 'done', endedAt: '2026-11-27T08:20:00Z' }, 'atelier');
  assert.equal(done.executions?.[0]?.startedAt, null); assert.equal(done.state, 'done');
});
test('recalage proposé puis confirmé atomiquement, intervalles libres conservés et aucun ordre matériel', async () => {
  const h = harness(), source = await h.create(), next = await h.create('Suivant', '2026-11-27T08:20:00Z'), gap = await h.create('Plus tard', '2026-11-27T10:00:00Z');
  const linked = await h.service.beginExecution(source.id, { expectedRevision: 1, mode: 'manual', confirm: true, startedAt: '2026-11-27T08:00:00Z' }, 'atelier');
  await assert.rejects(h.service.previewReplan(source.id, { expectedRevision: 2 }), /replan-unavailable/);
  h.now('2026-11-27T09:00:00.000Z');
  await h.service.finishExecution(source.id, linked.executions![0]!.id, { expectedRevision: 2, confirm: true, outcome: 'done', endedAt: '2026-11-27T09:00:00Z' }, 'atelier');
  const proposal = await h.service.previewReplan(source.id, { expectedRevision: 3 });
  assert.deepEqual(proposal.changes.map(item => item.id), [next.id]);
  assert.equal(h.service.list().work.find(item => item.id === next.id)?.scheduledStart, '2026-11-27T08:20:00Z', 'aucun déplacement avant confirmation');
  const applied = await h.service.applyReplan({ token: proposal.token, confirm: true }, 'atelier');
  assert.equal(applied.work.find(item => item.id === next.id)?.scheduledStart, '2026-11-27T09:00:00.000Z');
  assert.equal(applied.work.find(item => item.id === gap.id)?.scheduledStart, '2026-11-27T10:00:00Z');
  await assert.rejects(h.service.applyReplan({ token: proposal.token, confirm: true }, 'atelier'), /replan-expired/);
  assert.equal(h.calls(), 0);
});
test('proposition invalidée si le planning change ; persistance échouée sans faux résultat', async () => {
  const h = harness(), source = await h.create(); await h.create('Suivant', '2026-11-27T08:20:00Z');
  const linked = await h.service.beginExecution(source.id, { expectedRevision: 1, mode: 'manual', confirm: true }, 'atelier'); h.now('2026-11-27T09:00:00.000Z');
  await h.service.finishExecution(source.id, linked.executions![0]!.id, { expectedRevision: 2, confirm: true, outcome: 'failed', endedAt: '2026-11-27T09:00:00Z' }, 'atelier');
  const proposal = await h.service.previewReplan(source.id, { expectedRevision: 3 });
  await h.create('Ajout concurrent', '2026-11-27T09:15:00Z');
  await assert.rejects(h.service.applyReplan({ token: proposal.token, confirm: true }, 'atelier'), /project-conflict/);
  const retry = await h.service.previewReplan(source.id, { expectedRevision: 3 }); const before = h.service.list(), events = h.events(); h.fail();
  await assert.rejects(h.service.applyReplan({ token: retry.token, confirm: true }, 'atelier'), /storage-unavailable/);
  assert.deepEqual(h.service.list(), before); assert.equal(h.events(), events);
});


test('association refusée si la connexion machine change pendant la lecture native', async () => {
  let state: FabCoreState = { version: 1, admin: null, machines: [{ id: machineId, name: 'Machine', origin: 'http://old.invalid' }] };
  const store = { get state() { return state; }, save(next: FabCoreState) { state = next; } };
  const service = createProjectService({ store, persist: async next => { store.save(next); }, readMachine: async () => {
    store.save({ ...state, machines: state.machines.map(item => ({ ...item, origin: 'http://new.invalid' })) });
    return { status: 'printing', file: 'same.gcode' };
  } });
  const work = await service.saveWork(null, null, { title: 'Cible explicite', machineId }, 'atelier');
  await assert.rejects(service.beginExecution(work.id, { expectedRevision: 1, mode: 'observed', file: 'same.gcode', confirm: true }, 'atelier'), /execution-state/);
  assert.equal(service.list().work[0]?.executions, undefined);
});
