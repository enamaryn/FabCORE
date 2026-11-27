import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProductionExecution, ProductionWork } from '../../src/domain/projects.ts';
import { localDateTime, instantFromLocal } from '../src/production.ts';
import { executionMetrics, executionPhase } from '../src/production-actuals.ts';
const execution: ProductionExecution = { id: 'execution', machineId: 'machine', file: 'bookmark.gcode', linkedAt: '2026-11-27T10:05:00Z', linkedBy: 'atelier', mode: 'observed', startedAt: null, endedAt: null, outcome: 'active', observation: 'printing', observedAt: '2026-11-27T10:05:00Z', plannedStart: '2026-11-27T10:00:00Z', plannedMinutes: 20 };
const work = (extra: Partial<ProductionExecution> = {}): ProductionWork => ({ id: 'job', projectId: null, revision: 1, title: 'Bookmark', format: '2d', material: 'Wood', fileReference: 'bookmark.gcode', kind: 'production', quantity: 1, machineId: 'machine', estimatedMinutes: 20, dueDate: null, notes: '', state: 'todo', machineNameSnapshot: 'Laser', createdAt: execution.linkedAt, updatedAt: execution.linkedAt, createdBy: 'atelier', executions: [{ ...execution, ...extra }] });
test('Réel : l’association en cours ne déduit aucun début ni durée réelle', () => {
  const job = work(); const metrics = executionMetrics(job, Date.parse('2026-11-27T11:00:00Z'));
  assert.equal(executionPhase(job), 'running');
  assert.equal(executionPhase(work({ mode: 'manual', observation: 'unknown' })), 'running', 'une déclaration opérateur active n’exige pas une observation native');
  assert.equal(metrics.actualMinutes, null); assert.equal(metrics.elapsedMinutes, null); assert.equal(metrics.deltaMinutes, null); assert.equal(metrics.overrun, false);
});
test('Réel : une fin annoncée, une perte de liaison ou un autre fichier demandent confirmation sans succès automatique', () => {
  for (const observation of ['finish-reported', 'unknown', 'different-job'] as const) assert.equal(executionPhase(work({ observation })), 'confirm');
  assert.equal(executionPhase(work({ observation: 'paused' })), 'paused');
  assert.equal(executionPhase(work({ outcome: 'failed' })), 'failed');
  assert.equal(executionPhase(work({ outcome: 'cancelled' })), 'cancelled');
});
test('Réel : dépassement déclaré et delta réel utilisent le cliché prévu, pas une prévision modifiée ensuite', () => {
  const job = work({ startedAt: '2026-11-27T10:00:00Z' }); job.estimatedMinutes = 90;
  const active = executionMetrics(job, Date.parse('2026-11-27T10:25:00Z'));
  assert.equal(active.elapsedMinutes, 25); assert.equal(active.overrun, true); assert.equal(active.actualMinutes, null);
  const finished = executionMetrics(work({ startedAt: '2026-11-27T10:00:00Z', endedAt: '2026-11-27T10:30:00Z', outcome: 'done' }));
  assert.equal(finished.actualMinutes, 30); assert.equal(finished.deltaMinutes, 10); assert.equal(finished.elapsedMinutes, null); assert.equal(finished.overrun, false);
  const unknownStart = executionMetrics(work({ endedAt: '2026-11-27T10:30:00Z', outcome: 'done' }));
  assert.equal(unknownStart.actualMinutes, null); assert.equal(unknownStart.deltaMinutes, null);
});

test('Réel : conserver les secondes et millisecondes d’un horaire proposé non modifié', () => {
  const instant = '2026-11-27T10:00:30.123Z';
  assert.equal(instantFromLocal(localDateTime(instant), instant), instant);
});
