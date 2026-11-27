import type { ProductionWork } from '../../src/domain/projects.ts';

export interface ReplanPreview {
  token: string; sourceId: string; machineId: string; basedOnEnd: string; expiresAt: string;
  changes: { id: string; title: string; oldStart: string; newStart: string; expectedRevision: number }[];
}
export type ExecutionAction = { kind: 'start' | 'preview'; workId: string; data: Record<string, unknown> }
  | { kind: 'finish'; workId: string; executionId: string; data: Record<string, unknown> }
  | { kind: 'apply'; data: Record<string, unknown> };
export function latestExecution(work: ProductionWork) { return work.executions?.at(-1); }
export function executionPhase(work: ProductionWork) {
  const execution = latestExecution(work);
  if (!execution) return work.state === 'done' ? 'done' : work.state === 'cancelled' ? 'cancelled' : 'todo';
  if (execution.outcome !== 'active') return execution.outcome;
  if (execution.mode === 'manual') return 'running';
  if (execution.observation === 'finish-reported' || execution.observation === 'unknown' || execution.observation === 'different-job') return 'confirm';
  return execution.observation === 'paused' ? 'paused' : 'running';
}
export function executionMetrics(work: ProductionWork, now = Date.now()) {
  const execution = latestExecution(work);
  const start = execution?.startedAt ? Date.parse(execution.startedAt) : null;
  const end = execution?.endedAt ? Date.parse(execution.endedAt) : null;
  const actualMinutes = start !== null && end !== null ? Math.max(0, (end - start) / 60000) : null;
  const elapsedMinutes = execution?.outcome === 'active' && start !== null ? Math.max(0, (now - start) / 60000) : null;
  const plannedMinutes = execution?.plannedMinutes ?? null;
  return { actualMinutes, elapsedMinutes, deltaMinutes: actualMinutes !== null && plannedMinutes !== null ? actualMinutes - plannedMinutes : null,
    scheduleOverrun: execution?.outcome === 'active' && !!execution.plannedStart && plannedMinutes !== null && now > Date.parse(execution.plannedStart) + plannedMinutes * 60000,
    overrun: elapsedMinutes !== null && plannedMinutes !== null && elapsedMinutes > plannedMinutes };
}
