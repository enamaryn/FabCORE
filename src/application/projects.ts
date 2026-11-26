import Value from 'typebox/value';
import { randomUUID } from 'node:crypto';
import { ServiceError } from './errors.ts';
import { projectFields, workFields, ProjectBoardSchema, type Project, type ProductionWork, type ProjectBoard } from '../domain/projects.ts';
import type { FabCoreState, StateStore } from './state-store.ts';

export function createProjectService({ store, persist, changed = () => {}, now = () => new Date().toISOString() }: {
  store: StateStore; persist(next: FabCoreState): Promise<void>; changed?(): void; now?(): string;
}) {
  let queue = Promise.resolve();
  const board = (): ProjectBoard => {
    const value = store.state.projectBoard;
    if (value === undefined) return { version: 1, projects: [], work: [] };
    if (!Value.Check(ProjectBoardSchema, value) || value.projects.some(item => !projectFields(item as unknown as Record<string, unknown>))) throw new ServiceError(503, 'projects-storage');
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
  return {
    list() { return structuredClone(board()); },
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
    saveWork(projectId: string, id: string | null, input: Record<string, unknown>, actor: string) { return serial(async () => {
      const current = board(), parent = find(current, projectId);
      const previous = id ? current.work.find(item => item.id === id && item.projectId === projectId) ?? fail(404, 'missing') : null;
      if (previous) revision(input.expectedRevision, previous);
      if (!previous && parent.archived) return fail(409, 'project-archived');
      if (!previous && current.work.length >= 1000) return fail(409, 'project-limit');
      const fields = workFields({ format: parent.format, ...previous, ...input }); if (!fields) return fail(400, 'project-invalid');
      const machine = fields.machineId ? store.state.machines.find(item => item.id === fields.machineId) : undefined;
      if (fields.machineId && !machine && fields.machineId !== previous?.machineId) return fail(400, 'project-machine');
      const at = now(); const work: ProductionWork = { ...fields, id: previous?.id ?? randomUUID(), projectId,
        revision: (previous?.revision ?? 0) + 1, machineNameSnapshot: fields.machineId ? machine?.name ?? previous?.machineNameSnapshot ?? null : null,
        createdAt: previous?.createdAt ?? at, updatedAt: at, createdBy: previous?.createdBy ?? actor };
      const project = audit(parent, actor, previous ? 'work-edited' : 'work-created', at);
      await save({ ...current, projects: current.projects.map(item => item.id === projectId ? project : item),
        work: previous ? current.work.map(item => item.id === id ? work : item) : [...current.work, work] }); return work;
    }); },
  };
}
function fail(status: number, code: string): never { throw new ServiceError(status, code); }
