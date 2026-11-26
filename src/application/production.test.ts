import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectService } from './projects.ts';
import { workFields } from '../domain/projects.ts';
import type { FabCoreState } from './state-store.ts';
import { stateToRows, rowsToState } from '../persistence/mapping.ts';
const machineId = '11111111-1111-4111-8111-111111111111';
function harness() {
  let state: FabCoreState = { version: 1, admin: null, machines: [{ id: machineId, name: 'Machine de test', kind: 'klipper', origin: 'http://printer.invalid' }] };
  let fail = false, published = 0;
  const store = { get state() { return state; }, save(next: FabCoreState) { state = next; } };
  return { store, fail() { fail = true; }, published: () => published,
    service: createProjectService({ store, persist: async next => { if (fail) throw new Error('storage-unavailable'); store.save(next); }, changed: () => { published++; } }) };
}
test('production autonome sans aucun projet : création, planification, changement de durée et retour en réserve', async () => {
  const h = harness(); const originalMachines = structuredClone(h.store.state.machines);
  const work = await h.service.saveWork(null, null, { title: 'Commande directe', client: 'Client A', quantity: 4, material: 'PLA', fileReference: 'v2.3mf' }, 'atelier');
  assert.equal(work.projectId, null); assert.equal(work.client, 'Client A'); assert.equal(work.scheduledStart, null);
  assert.equal(h.service.list().projects.length, 0, 'ne crée pas un projet implicite');
  const planned = await h.service.saveWork(null, work.id, { expectedRevision: 1, machineId, estimatedMinutes: 90, scheduledStart: '2026-11-27T08:00:00.000Z' }, 'atelier');
  assert.equal(planned.scheduledStart, '2026-11-27T08:00:00.000Z'); assert.equal(planned.machineNameSnapshot, 'Machine de test');
  const changed = await h.service.saveWork(null, work.id, { expectedRevision: 2, estimatedMinutes: 120 }, 'atelier');
  const unscheduled = await h.service.saveWork(null, work.id, { expectedRevision: changed.revision, scheduledStart: null, machineId: null }, 'atelier');
  assert.equal(unscheduled.scheduledStart, null); assert.equal(unscheduled.machineId, null);
  assert.deepEqual(h.store.state.machines, originalMachines); assert.equal(h.published(), 4);
  assert.deepEqual(rowsToState(stateToRows(h.store.state)).projectBoard, h.service.list());
});
test('production : anciens travaux lisibles, source projet préservée, routes projet cloisonnées', async () => {
  const h = harness(); const project = await h.service.create({ title: 'Création', client: 'Client projet' }, 'atelier');
  const linked = await h.service.saveWork(project.id, null, { title: 'Prototype' }, 'atelier');
  assert.equal(linked.client, 'Client projet');
  // Anciennes sauvegardes : les nouveaux champs optionnels n’existaient pas.
  delete h.store.state.projectBoard!.work[0]!.client; delete h.store.state.projectBoard!.work[0]!.scheduledStart;
  assert.equal(h.service.list().work[0]!.projectId, project.id);
  const edited = await h.service.saveWork(null, linked.id, { expectedRevision: 1, scheduledStart: '2026-11-27T09:00:00Z', machineId, estimatedMinutes: 30 }, 'atelier');
  assert.equal(edited.projectId, project.id); assert.equal(h.service.list().projects[0]!.history.at(-1)?.action, 'work-edited');
  await assert.rejects(h.service.saveWork(null, linked.id, { expectedRevision: 2, projectId: null }, 'atelier'), /project-invalid/);
  const standalone = await h.service.saveWork(null, null, { title: 'Indépendant' }, 'atelier');
  await assert.rejects(h.service.saveWork(project.id, standalone.id, { expectedRevision: 1, state: 'done' }, 'atelier'), /missing/);
  const fromPlanning = await h.service.saveWork(null, null, { title: 'Lié facultativement', projectId: project.id }, 'atelier');
  assert.equal(fromPlanning.projectId, project.id);
  await assert.rejects(h.service.saveWork(null, null, { title: 'Mauvais lien', projectId: 42 }, 'atelier'), /project-invalid/);
});
test('production : dates UTC réelles, machine et durée exigées ; conflits de planning conservés pour signalement', async () => {
  const base = { title: 'Fabrication', scheduledStart: '2026-11-27T08:00:00.000Z', machineId, estimatedMinutes: 60 };
  for (const patch of [{ scheduledStart: '2026-02-30T08:00:00.000Z' }, { scheduledStart: '2026-11-27T25:00:00Z' }, { scheduledStart: '2026-11-27' }, { scheduledStart: '2026-11-27T08:00:00+02:00' }, { machineId: null }, { estimatedMinutes: null }, { estimatedMinutes: 0 }, { scheduledStart: 123 }, { client: null }]) assert.equal(workFields({ ...base, ...patch }), null);
  assert.ok(workFields(base));
  const h = harness();
  const first = await h.service.saveWork(null, null, base, 'atelier');
  const second = await h.service.saveWork(null, null, { ...base, title: 'Chevauchement visible' }, 'atelier');
  assert.notEqual(first.id, second.id, 'le planning peut montrer un conflit au lieu de déplacer silencieusement un travail');
  const result = await Promise.allSettled([
    h.service.saveWork(null, first.id, { expectedRevision: 1, scheduledStart: '2026-11-27T12:00:00.000Z' }, 'atelier'),
    h.service.saveWork(null, first.id, { expectedRevision: 1, scheduledStart: null }, 'atelier'),
  ]);
  assert.equal(result.filter(value => value.status === 'fulfilled').length, 1);
  assert.match(String((result.find(value => value.status === 'rejected') as PromiseRejectedResult).reason), /project-conflict/);
});
test('production : persistance refusée sans événement de succès ni écrasement du planning', async () => {
  const h = harness(); const work = await h.service.saveWork(null, null, { title: 'À conserver' }, 'atelier'); h.fail();
  await assert.rejects(h.service.saveWork(null, work.id, { expectedRevision: 1, machineId, estimatedMinutes: 60, scheduledStart: '2026-11-27T08:00:00Z' }, 'atelier'), /storage-unavailable/);
  assert.equal(h.service.list().work[0]?.revision, 1); assert.equal(h.service.list().work[0]?.scheduledStart, null); assert.equal(h.published(), 1);
});
