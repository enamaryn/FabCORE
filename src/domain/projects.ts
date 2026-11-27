import Type from 'typebox';
import Value from 'typebox/value';

export const projectStages = ['idea', 'scoping', 'design', 'prototype', 'final'] as const;
const enumeration = <T extends readonly string[]>(values: T) => Type.Unsafe<T[number]>(Type.Union(values.map(value => Type.Literal(value))));
const date = Type.Union([Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' }), Type.Null()]);
const id = Type.String({ pattern: '^[a-f0-9-]{36}$' });
export const ProjectFields = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 120 }), description: Type.String({ maxLength: 4000 }), notes: Type.String({ maxLength: 8000 }),
  stage: enumeration(projectStages), format: enumeration(['2d', '3d', 'mixed'] as const), origin: enumeration(['personal', 'client'] as const),
  client: Type.String({ maxLength: 120 }), owner: Type.String({ maxLength: 80 }), priority: enumeration(['low', 'normal', 'high'] as const),
  dueDate: date, tags: Type.Array(Type.String({ minLength: 1, maxLength: 30 }), { maxItems: 10 }),
  blockedReason: Type.String({ maxLength: 500 }), archived: Type.Boolean(),
  links: Type.Array(Type.Object({ label: Type.String({ minLength: 1, maxLength: 100 }), url: Type.String({ maxLength: 2048 }), kind: enumeration(['reference', 'design', 'final'] as const) }, { additionalProperties: false }), { maxItems: 12 }),
  checklist: Type.Array(Type.Object({ text: Type.String({ minLength: 1, maxLength: 200 }), done: Type.Boolean() }, { additionalProperties: false }), { maxItems: 40 }),
}, { additionalProperties: false });
export type ProjectFields = Type.Static<typeof ProjectFields>;
export interface Project extends ProjectFields {
  id: string; revision: number; createdAt: string; updatedAt: string; createdBy: string;
  history: { at: string; actor: string; action: string; from?: string; to?: string }[];
}
export const WorkFields = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 120 }), format: enumeration(['2d', '3d', 'mixed'] as const), material: Type.String({ maxLength: 120 }), fileReference: Type.String({ maxLength: 2048 }), kind: enumeration(['prototype', 'production'] as const),
  quantity: Type.Integer({ minimum: 1, maximum: 1000000 }), machineId: Type.Union([id, Type.Null()]),
  estimatedMinutes: Type.Union([Type.Integer({ minimum: 1, maximum: 525600 }), Type.Null()]),
  dueDate: date, notes: Type.String({ maxLength: 4000 }), state: enumeration(['todo', 'done', 'cancelled'] as const),
  client: Type.Optional(Type.String({ maxLength: 120 })), scheduledStart: Type.Optional(Type.Union([Type.String({ maxLength: 30 }), Type.Null()])),
}, { additionalProperties: false });
export type WorkFields = Type.Static<typeof WorkFields>;
export const ProductionExecutionSchema = Type.Object({
  id, machineId: id, file: Type.String({ maxLength: 512 }), linkedAt: Type.String({ maxLength: 30 }), linkedBy: Type.String({ maxLength: 80 }),
  mode: enumeration(['observed', 'manual'] as const), startedAt: Type.Union([Type.String({ maxLength: 30 }), Type.Null()]), endedAt: Type.Union([Type.String({ maxLength: 30 }), Type.Null()]),
  outcome: enumeration(['active', 'done', 'failed', 'cancelled'] as const), observation: enumeration(['printing', 'paused', 'finish-reported', 'unknown', 'different-job'] as const),
  observedAt: Type.String({ maxLength: 30 }), plannedStart: Type.Union([Type.String({ maxLength: 30 }), Type.Null()]), plannedMinutes: Type.Union([Type.Integer({ minimum: 1, maximum: 525600 }), Type.Null()]),
}, { additionalProperties: false });
export type ProductionExecution = Type.Static<typeof ProductionExecutionSchema>;
export interface ProductionWork extends WorkFields { id: string; projectId: string | null; revision: number; machineNameSnapshot: string | null; createdAt: string; updatedAt: string; createdBy: string; executions?: ProductionExecution[] }
export interface ProjectBoard { version: 1; projects: Project[]; work: ProductionWork[] }
const stamp = Type.String({ minLength: 1, maxLength: 64 });
export const ProjectRecord = Type.Object({ ...ProjectFields.properties, id, revision: Type.Integer({ minimum: 1 }), createdAt: stamp, updatedAt: stamp, createdBy: Type.String({ maxLength: 80 }),
  history: Type.Array(Type.Object({ at: stamp, actor: Type.String({ maxLength: 80 }), action: Type.String({ maxLength: 40 }), from: Type.Optional(Type.String()), to: Type.Optional(Type.String()) }, { additionalProperties: false }), { maxItems: 50 }) }, { additionalProperties: false });
export const WorkRecord = Type.Object({ ...WorkFields.properties, executions: Type.Optional(Type.Array(ProductionExecutionSchema, { maxItems: 20 })), id, projectId: Type.Union([id, Type.Null()]), revision: Type.Integer({ minimum: 1 }), machineNameSnapshot: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]), createdAt: stamp, updatedAt: stamp, createdBy: Type.String({ maxLength: 80 }) }, { additionalProperties: false });
export const ProjectBoardSchema = Type.Object({ version: Type.Literal(1), projects: Type.Array(ProjectRecord, { maxItems: 250 }), work: Type.Array(WorkRecord, { maxItems: 1000 }) }, { additionalProperties: false });
const validDate = (value: string | null) => value === null || Number.isFinite(Date.parse(value + 'T00:00:00.000Z')) && new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) === value;

/** Pure metadata validation: no connector, path read or remote fetch. */
export function projectFields(input: Record<string, unknown>): ProjectFields | null {
  const value = {
    title: typeof input.title === 'string' ? input.title.trim() : input.title,
    description: (input.description === undefined ? '' : input.description), notes: (input.notes === undefined ? '' : input.notes), stage: (input.stage === undefined ? 'idea' : input.stage), format: (input.format === undefined ? '3d' : input.format), origin: (input.origin === undefined ? 'personal' : input.origin),
    client: (input.client === undefined ? '' : input.client), owner: (input.owner === undefined ? '' : input.owner), priority: (input.priority === undefined ? 'normal' : input.priority), dueDate: input.dueDate ?? null,
    tags: (input.tags === undefined ? [] : input.tags), blockedReason: (input.blockedReason === undefined ? '' : input.blockedReason), archived: (input.archived === undefined ? false : input.archived), links: (input.links === undefined ? [] : input.links), checklist: (input.checklist === undefined ? [] : input.checklist),
  };
  if (!Value.Check(ProjectFields, value) || !validDate(value.dueDate)) return null;
  if (value.links.some(link => { try { const url = new URL(link.url); return !['https:', 'http:'].includes(url.protocol) || Boolean(url.username || url.password); } catch { return true; } })) return null;
  return structuredClone(value);
}
export function workFields(input: Record<string, unknown>): WorkFields | null {
  const value = { title: typeof input.title === 'string' ? input.title.trim() : input.title, format: (input.format === undefined ? '3d' : input.format), material: (input.material === undefined ? '' : input.material), fileReference: (input.fileReference === undefined ? '' : input.fileReference), kind: (input.kind === undefined ? 'production' : input.kind), quantity: (input.quantity === undefined ? 1 : input.quantity),
    machineId: input.machineId ?? null, estimatedMinutes: input.estimatedMinutes ?? null, dueDate: input.dueDate ?? null, client: input.client === undefined ? '' : input.client, scheduledStart: input.scheduledStart ?? null, notes: (input.notes === undefined ? '' : input.notes), state: (input.state === undefined ? 'todo' : input.state) };
  if (!Value.Check(WorkFields, value) || !validDate(value.dueDate)) return null;
  if (value.scheduledStart !== null) {
    // Instants are stored in UTC; local display/conversion belongs to the UI. Reject normalised impossible dates.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.scheduledStart)) return null;
    const time = Date.parse(value.scheduledStart);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== value.scheduledStart.replace(/Z$/, value.scheduledStart.includes('.') ? 'Z' : '.000Z') || !value.machineId || !value.estimatedMinutes) return null;
    if (!Number.isFinite(time + value.estimatedMinutes * 60000) || time + value.estimatedMinutes * 60000 > Date.parse('9999-12-31T23:59:59.999Z')) return null;
  }
  return structuredClone(value);
}

/** Canonical UTC instant for operator-declared execution timestamps. */
export function executionInstant(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value.replace(/Z$/, value.includes('.') ? 'Z' : '.000Z');
}
