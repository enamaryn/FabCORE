import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectService } from './projects.ts';
import type { FabCoreState } from './state-store.ts';
import { projectFields, workFields } from '../domain/projects.ts';
import { rowsToState, stateToRows } from '../persistence/mapping.ts';

function harness() {
  let state: FabCoreState = { version: 1, admin: null, machines: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Laser', kind: 'xtool-m2', origin: 'https://192.168.1.20' }] };
  let published = 0, failed = false;
  const store = { get state() { return state; }, save(next: FabCoreState) { state = next; } };
  const service = createProjectService({ store, persist: async next => { if (failed) throw new Error('storage-unavailable'); store.save(next); }, changed: () => { published++; } });
  return { store, service, published: () => published, fail: () => { failed = true; } };
}

test('Projets : idée personnelle et demande client, transitions et audit ; aucun état machine modifié', async () => {
  const h = harness(); const machines = structuredClone(h.store.state.machines);
  const idea = await h.service.create({ title: '  Nouvelle création  ', format: 'mixed', links: [{ label: 'Plan', url: 'https://example.test/plan.step', kind: 'design' }], checklist: [{ text: 'Faire un prototype', done: false }], id: 'injected', createdBy: 'intruder' }, 'atelier');
  assert.equal(idea.title, 'Nouvelle création'); assert.equal(idea.createdBy, 'atelier'); assert.notEqual(idea.id, 'injected');
  const client = await h.service.create({ title: 'Demande client', origin: 'client', client: 'Référence A', format: '2d' }, 'atelier');
  assert.equal(client.origin, 'client');
  const moved = await h.service.update(idea.id, { stage: 'design', expectedRevision: idea.revision, blockedReason: 'Dimensions à confirmer' }, 'atelier');
  assert.equal(moved.stage, 'design'); assert.equal(moved.history.at(-1)?.from, 'idea'); assert.equal(moved.history.at(-1)?.to, 'design');
  assert.deepEqual(h.store.state.machines, machines);
  assert.equal(h.published(), 3);
  const copy = h.service.list(); copy.projects[0]!.title = 'local mutation'; assert.equal(h.service.list().projects[0]?.title, 'Nouvelle création');
});

test('Projets : concurrence explicite, archivage réversible et plusieurs travaux distincts du projet', async () => {
  const h = harness(); const project = await h.service.create({ title: 'Ensemble 2D / 3D', format: 'mixed' }, 'admin');
  const results = await Promise.allSettled([
    h.service.update(project.id, { expectedRevision: 1, stage: 'prototype' }, 'admin'),
    h.service.update(project.id, { expectedRevision: 1, stage: 'final' }, 'admin'),
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  const rejected = results.find(item => item.status === 'rejected'); assert.equal(rejected?.status === 'rejected' && rejected.reason.message, 'project-conflict');
  const work = await h.service.saveWork(project.id, null, { title: 'Panneau', format: '2d', material: 'Bois', quantity: 3, machineId: h.store.state.machines[0]!.id, estimatedMinutes: 30 }, 'admin');
  await h.service.saveWork(project.id, null, { title: 'Pièces 3D', format: '3d', kind: 'prototype', quantity: 1 }, 'admin');
  assert.equal(h.service.list().work.length, 2); assert.equal(h.service.list().projects[0]?.stage, 'prototype');
  assert.equal(work.machineNameSnapshot, 'Laser');
  const current = h.service.list().projects[0]!;
  const archived = await h.service.update(project.id, { expectedRevision: current.revision, archived: true }, 'admin');
  await assert.rejects(h.service.saveWork(project.id, null, { title: 'refused' }, 'admin'), /project-archived/);
  assert.equal(h.service.list().work.length, 2, 'archiver le projet ne supprime aucun travail');
  await h.service.update(project.id, { expectedRevision: archived.revision, archived: false }, 'admin');
  h.store.save({ ...h.store.state, machines: [] });
  const done = await h.service.saveWork(project.id, work.id, { expectedRevision: work.revision, state: 'done' }, 'admin');
  assert.equal(done.machineNameSnapshot, 'Laser'); assert.equal(done.state, 'done');
  await assert.rejects(h.service.saveWork(project.id, work.id, { expectedRevision: work.revision, notes: 'stale' }, 'admin'), /project-conflict/);
});

test('Projets : liens/dates/champs invalides refusés et données conservées si la persistance échoue', async () => {
  for (const input of [ { title: '' }, { title: 'x', dueDate: '2026-02-31' }, { title: 'x', links: [{ label: 'bad', url: 'javascript:alert(1)', kind: 'reference' }] },
    { title: 'x', links: [{ label: 'bad', url: 'https://user:password@example.test/', kind: 'final' }] }, { title: 'x', stage: 'printing' } ]) assert.equal(projectFields(input), null);
  assert.equal(workFields({ title: 'x', quantity: 0 }), null); assert.equal(workFields({ title: 'x', estimatedMinutes: -1 }), null);
  const h = harness(); const project = await h.service.create({ title: 'Keep me' }, 'admin');
  h.fail(); await assert.rejects(h.service.update(project.id, { expectedRevision: 1, stage: 'final' }, 'admin'), /storage-unavailable/);
  assert.equal(h.service.list().projects[0]?.revision, 1); assert.equal(h.published(), 1);
});

test('Projets : mapping PostgreSQL sans perte, affectation inconnue refusée', async () => {
  const h = harness(); const project = await h.service.create({ title: 'Persist', notes: 'Conception', format: '3d' }, 'admin');
  await h.service.saveWork(project.id, null, { title: 'Prototype' }, 'admin');
  const result = rowsToState(stateToRows(h.store.state)); assert.deepEqual(result.projectBoard, h.store.state.projectBoard);
  await assert.rejects(h.service.saveWork(project.id, null, { title: 'Bad machine', machineId: '22222222-2222-4222-8222-222222222222' }, 'admin'), /project-machine/);
});
