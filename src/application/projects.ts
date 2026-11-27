import Value from 'typebox/value';
import { randomUUID } from 'node:crypto';
import { ServiceError } from './errors.ts';
import { projectFields, workFields, ProjectBoardSchema, type Project, type ProductionWork, type ProjectBoard, type ProductionExecution, executionInstant } from '../domain/projects.ts';
import type { FabCoreState, StateStore, MachineRecord } from './state-store.ts';

export function createProjectService({ store, persist, changed = () => {}, readMachine, now = () => new Date().toISOString() }: {
  store: StateStore; persist(next: FabCoreState): Promise<void>; changed?(): void; readMachine?(machine: MachineRecord): Promise<Record<string, unknown>>; now?(): string;
}) {
  let queue = Promise.resolve();
  const proposals = new Map<string, { proposal: ReplanProposal; fingerprint: string }>();
  const initialWork = Array.isArray(store.state.projectBoard?.work) ? store.state.projectBoard.work : [];
  const unverified = new Set(initialWork.flatMap(item => Array.isArray(item.executions) ? item.executions.filter(value => value.outcome === 'active').map(value => value.id) : []));
  const board = (): ProjectBoard => {
    const value = store.state.projectBoard;
    if (value === undefined) return { version: 1, projects: [], work: [] };
    if (!Value.Check(ProjectBoardSchema, value) || value.projects.some(item => !projectFields(item as unknown as Record<string, unknown>)) || value.work.some(item => !workFields(item as unknown as Record<string, unknown>) || item.executions?.some(execution => !validExecution(execution)))) throw new ServiceError(503, 'projects-storage');
    return value;
  };
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation); queue = result.then(() => {}, () => {}); return result;
  };
  const find = (current: ProjectBoard, id: string) => current.projects.find(item => item.id === id) ?? fail(404, 'missing');
  const revision = (expected: unknown, current: { revision: number }) => { if (expected !== current.revision) fail(409, 'project-conflict'); };
  const audit = (project: Project, actor: string, action: string, at: string, extra: { from?: string; to?: string } = {}) => ({
    ...project, revision: project.revision + 1, updatedAt: at, history: [...project.history, { at, actor, action, ...extra }].slice(-50),
  });
  async function save(next: ProjectBoard) { await persist({ ...store.state, projectBoard: next }); changed(); }
  async function saveWorkRecord(current: ProjectBoard, updated: ProductionWork, actor: string, at: string) {
    await save({ ...current, work: current.work.map(item => item.id === updated.id ? updated : item), projects: current.projects.map(item => item.id === updated.projectId ? audit(item, actor, 'work-edited', at) : item) });
  }
  return {
    list() { const copy = structuredClone(board()); for (const work of copy.work) for (const execution of work.executions ?? []) if (execution.outcome === 'active' && execution.mode === 'observed' && (unverified.has(execution.id) || Date.parse(now()) - Date.parse(execution.observedAt) > 90000)) execution.observation = 'unknown'; return copy; },
    create(input: Record<string, unknown>, actor: string) { return serial(async () => {
      const current = board(); const fields = projectFields(input); if (!fields) return fail(400, 'project-invalid');
      if (current.projects.length >= 250) return fail(409, 'project-limit');
      const at = now(); const project: Project = { ...fields, id: randomUUID(), revision: 1, createdAt: at, updatedAt: at, createdBy: actor, history: [{ at, actor, action: 'created' }] };
      await save({ ...current, projects: [...current.projects, project] }); return project;
    }); },
    update(id: string, input: Record<string, unknown>, actor: string) { return serial(async () => {
      const current = board(), previous = find(current, id); revision(input.expectedRevision, previous);
      const fields = projectFields({ ...previous, ...input }); if (!fields) return fail(400, 'project-invalid');
      const action = previous.archived !== fields.archived ? fields.archived ? 'archived' : 'restored' : previous.stage !== fields.stage ? 'moved' : 'edited';
      const project = audit({ ...previous, ...fields }, actor, action, now(), previous.stage !== fields.stage ? { from: previous.stage, to: fields.stage } : {});
      await save({ ...current, projects: current.projects.map(item => item.id === id ? project : item) }); return project;
    }); },
    async beginExecution(id: string, input: Record<string, unknown>, actor: string) {
      if (input.confirm !== true || !['observed', 'manual'].includes(input.mode as string)) return fail(400, 'execution-invalid');
      const candidate = findWork(board(), id);
      const machine = store.state.machines.find(item => item.id === candidate.machineId);
      if (!machine) return fail(409, 'execution-machine');
      let report: Record<string, unknown> | null = null;
      if (input.mode === 'observed') {
        try { report = readMachine ? await readMachine(machine) : null; } catch { /* A read failure is never a job failure. */ }
        if (!report || !['printing', 'paused'].includes(report.status as string) || typeof report.file !== 'string' || !report.file || report.file !== input.file) return fail(409, 'execution-unavailable');
        if (report.checkedAt && (!executionInstant(report.checkedAt) || Date.parse(report.checkedAt) < Date.parse(now()) - 15000)) return fail(409, 'execution-unavailable');
      }
      return serial(async () => {
        const current = board(), work = findWork(current, id); revision(input.expectedRevision, work);
        if (!store.state.machines.includes(machine) || work.machineId !== machine.id || work.state !== 'todo') return fail(409, 'execution-state');
        if (current.work.some(item => active(item)?.machineId === machine.id) || active(work)) return fail(409, 'execution-busy');
        if ((work.executions?.length ?? 0) >= 20) return fail(409, 'execution-limit');
        const at = now(), startedAt = input.startedAt ?? null;
        if (startedAt !== null && (!executionInstant(startedAt) || Date.parse(startedAt) > Date.parse(at) + 60000)) return fail(400, 'execution-invalid');
        const file = input.file ?? '';
        if (typeof file !== 'string' || file.length > 512 || [...file].some(character => character.charCodeAt(0) < 32)) return fail(400, 'execution-invalid');
        const execution: ProductionExecution = { id: randomUUID(), machineId: machine.id, file, linkedAt: at, linkedBy: actor, mode: input.mode as 'observed' | 'manual',
          startedAt: startedAt as string | null, endedAt: null, outcome: 'active', observation: report?.status === 'paused' ? 'paused' : input.mode === 'observed' ? 'printing' : 'unknown', observedAt: at,
          plannedStart: work.scheduledStart ?? null, plannedMinutes: work.estimatedMinutes };
        const updated = { ...work, executions: [...work.executions ?? [], execution], revision: work.revision + 1, updatedAt: at };
        await saveWorkRecord(current, updated, actor, at); return updated;
      });
    },
    finishExecution(id: string, executionId: string, input: Record<string, unknown>, actor: string) { return serial(async () => {
      const current = board(), work = findWork(current, id); revision(input.expectedRevision, work);
      const execution = active(work), at = now();
      if (!execution || execution.id !== executionId) return fail(409, 'execution-state');
      if (input.confirm !== true || !['done', 'failed', 'cancelled'].includes(input.outcome as string) || !executionInstant(input.endedAt)) return fail(400, 'execution-invalid');
      const startedAt = input.startedAt === undefined ? execution.startedAt : input.startedAt;
      if (startedAt !== null && !executionInstant(startedAt)) return fail(400, 'execution-invalid');
      if (Date.parse(input.endedAt) > Date.parse(at) + 60000 || Date.parse(input.endedAt) < Date.parse(execution.linkedAt) - 60000 || startedAt && Date.parse(startedAt) > Date.parse(input.endedAt)) return fail(400, 'execution-invalid');
      const finished: ProductionExecution = { ...execution, startedAt: startedAt as string | null, endedAt: input.endedAt, outcome: input.outcome as 'done' | 'failed' | 'cancelled' };
      const updated: ProductionWork = { ...work, state: input.outcome === 'done' ? 'done' : input.outcome === 'cancelled' ? 'cancelled' : 'todo', executions: work.executions!.map(item => item.id === executionId ? finished : item), revision: work.revision + 1, updatedAt: at };
      await saveWorkRecord(current, updated, actor, at); unverified.delete(execution.id); return updated;
    }); },
    observeExecution(machineId: string, report: Record<string, unknown>) { return serial(async () => {
      const current = board(); const work = current.work.find(item => active(item)?.machineId === machineId && active(item)?.mode === 'observed');
      if (!work) return;
      const execution = active(work)!, at = now();
      let observation: ProductionExecution['observation'] = 'unknown';
      const fresh = !report.checkedAt || executionInstant(report.checkedAt) && Date.parse(report.checkedAt) >= Date.parse(at) - 15000;
      if (execution.observation === 'different-job') observation = 'different-job';
      else if (fresh && typeof report.file === 'string' && report.file && report.file !== execution.file) observation = 'different-job';
      else if (fresh && report.file === execution.file) {
        if (report.status === 'printing') observation = 'printing';
        else if (report.status === 'paused') observation = 'paused';
        else if (report.status === 'done') observation = 'finish-reported';
      }
      if (!unverified.has(execution.id) && observation === execution.observation && Date.parse(at) - Date.parse(execution.observedAt) < 60000) return;
      const updated = { ...work, executions: work.executions!.map(item => item.id === execution.id ? { ...item, observation, observedAt: at } : item) };
      await save({ ...current, work: current.work.map(item => item.id === work.id ? updated : item) });
      unverified.delete(execution.id);
    }); },
    previewReplan(id: string, input: Record<string, unknown>) { return serial(async () => {
      const current = board(), work = findWork(current, id); revision(input.expectedRevision, work);
      const execution = work.executions?.at(-1);
      if (!execution || execution.outcome === 'active' || !execution.endedAt || !execution.plannedStart || !execution.plannedMinutes) return fail(409, 'replan-unavailable');
      if (current.work.some(item => active(item)?.machineId === execution.machineId)) return fail(409, 'replan-unavailable');
      const expectedEnd = Date.parse(execution.plannedStart) + execution.plannedMinutes * 60000;
      let cursor = Date.parse(execution.endedAt);
      if (cursor <= expectedEnd) return fail(409, 'replan-unavailable');
      const candidates = current.work.filter(item => item.id !== id && item.machineId === execution.machineId && item.state === 'todo' && !active(item) && item.scheduledStart && item.estimatedMinutes && Date.parse(item.scheduledStart) >= Date.parse(execution.plannedStart!)).sort((a, b) => Date.parse(a.scheduledStart!) - Date.parse(b.scheduledStart!) || a.id.localeCompare(b.id));
      const changes: ReplanProposal['changes'] = [];
      for (const item of candidates) {
        const original = Date.parse(item.scheduledStart!), shifted = Math.max(original, cursor);
        if (shifted + item.estimatedMinutes! * 60000 > Date.parse('9999-12-31T23:59:59.999Z')) return fail(409, 'replan-unavailable');
        if (shifted > original) changes.push({ id: item.id, title: item.title, oldStart: item.scheduledStart!, newStart: new Date(shifted).toISOString(), expectedRevision: item.revision });
        cursor = shifted + item.estimatedMinutes! * 60000;
      }
      const proposal: ReplanProposal = { token: randomUUID(), sourceId: id, machineId: execution.machineId, basedOnEnd: execution.endedAt, expiresAt: new Date(Date.parse(now()) + 300000).toISOString(), changes };
      if (proposals.size >= 50) proposals.delete(proposals.keys().next().value!);
      proposals.set(proposal.token, { proposal, fingerprint: fingerprint(current, execution.machineId) });
      return structuredClone(proposal);
    }); },
    applyReplan(input: Record<string, unknown>, actor: string) { return serial(async () => {
      if (input.confirm !== true || typeof input.token !== 'string') return fail(400, 'execution-invalid');
      const entry = proposals.get(input.token), current = board();
      if (!entry || Date.parse(entry.proposal.expiresAt) < Date.parse(now())) return fail(409, 'replan-expired');
      if (fingerprint(current, entry.proposal.machineId) !== entry.fingerprint) return fail(409, 'project-conflict');
      const at = now(), revisions = new Map(entry.proposal.changes.map(item => [item.id, item]));
      const work = current.work.map(item => { const change = revisions.get(item.id); return change ? { ...item, scheduledStart: change.newStart, updatedAt: at, revision: item.revision + 1 } : item; });
      const parents = new Set(work.filter(item => revisions.has(item.id)).map(item => item.projectId));
      const projects = current.projects.map(item => parents.has(item.id) ? audit(item, actor, 'work-edited', at) : item);
      await save({ ...current, projects, work }); proposals.delete(input.token); return structuredClone({ ...current, projects, work });
    }); },
    saveWork(projectId: string | null, id: string | null, input: Record<string, unknown>, actor: string) { return serial(async () => {
      const current = board();
      const previous = id ? current.work.find(item => item.id === id && (projectId === null || item.projectId === projectId)) ?? fail(404, 'missing') : null;
      // Production routes accept standalone work; project routes keep their explicit parent boundary.
      const parentId: unknown = previous ? previous.projectId : projectId ?? input.projectId ?? null;
      if (parentId !== null && (typeof parentId !== 'string' || !/^[a-f0-9-]{36}$/.test(parentId))) return fail(400, 'project-invalid');
      if (previous && input.projectId !== undefined && input.projectId !== previous.projectId) return fail(400, 'project-invalid');
      const parent = parentId === null ? null : find(current, parentId as string);
      if (previous) {
        revision(input.expectedRevision, previous);
        if (active(previous) && ['machineId', 'scheduledStart', 'estimatedMinutes', 'state'].some(key => Object.hasOwn(input, key) && (input[key] ?? null) !== (previous[key as keyof ProductionWork] ?? null))) return fail(409, 'execution-active');
      }
      if (!previous && parent?.archived) return fail(409, 'project-archived');
      if (!previous && current.work.length >= 1000) return fail(409, 'project-limit');
      const fields = workFields({ format: parent?.format ?? '3d', client: parent?.client ?? '', ...previous, ...input }); if (!fields) return fail(400, 'project-invalid');
      const machine = fields.machineId ? store.state.machines.find(item => item.id === fields.machineId) : undefined;
      if (fields.machineId && !machine && fields.machineId !== previous?.machineId) return fail(400, 'project-machine');
      const at = now(); const work: ProductionWork = { ...fields, ...(previous?.executions ? { executions: previous.executions } : {}), id: previous?.id ?? randomUUID(), projectId: parent?.id ?? null,
        revision: (previous?.revision ?? 0) + 1, machineNameSnapshot: fields.machineId ? machine?.name ?? previous?.machineNameSnapshot ?? null : null,
        createdAt: previous?.createdAt ?? at, updatedAt: at, createdBy: previous?.createdBy ?? actor };
      const project = parent ? audit(parent, actor, previous ? 'work-edited' : 'work-created', at) : null;
      await save({ ...current, projects: current.projects.map(item => project && item.id === project.id ? project : item),
        work: previous ? current.work.map(item => item.id === id ? work : item) : [...current.work, work] }); return work;
    }); },
  };
}
function fail(status: number, code: string): never { throw new ServiceError(status, code); }

export interface ReplanProposal { token: string; sourceId: string; machineId: string; basedOnEnd: string; expiresAt: string; changes: { id: string; title: string; oldStart: string; newStart: string; expectedRevision: number }[] }
const active = (work: ProductionWork) => { const latest = work.executions?.at(-1); return latest?.outcome === 'active' ? latest : null; };
const findWork = (board: ProjectBoard, id: string) => board.work.find(item => item.id === id) ?? fail(404, 'missing');
const fingerprint = (board: ProjectBoard, machineId: string) => JSON.stringify(board.work.filter(item => item.machineId === machineId || item.executions?.some(value => value.machineId === machineId)).map(item => ({ id: item.id, revision: item.revision, state: item.state, start: item.scheduledStart, duration: item.estimatedMinutes, machineId: item.machineId, executions: item.executions?.map(value => ({ id: value.id, outcome: value.outcome, end: value.endedAt })) })));

const validExecution = (value: ProductionExecution) => executionInstant(value.linkedAt) && executionInstant(value.observedAt) && (value.plannedStart === null || executionInstant(value.plannedStart)) && (value.startedAt === null || executionInstant(value.startedAt)) && (value.endedAt === null || executionInstant(value.endedAt)) && (value.outcome === 'active' ? value.endedAt === null : value.endedAt !== null) && !(value.startedAt && value.endedAt && Date.parse(value.startedAt) > Date.parse(value.endedAt));
