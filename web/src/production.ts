import type { ProductionWork } from '../../src/domain/projects.ts';

/** Browser-local wall time for datetime-local; never reinterpret a local value as UTC. */
export function localDateTime(instant: string | null | undefined): string {
  if (!instant) return '';
  const value = new Date(instant); if (!Number.isFinite(value.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
export function instantFromLocal(value: string, preservedInstant?: string | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  if (preservedInstant && localDateTime(preservedInstant) === value) return new Date(preservedInstant).toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && localDateTime(date.toISOString()) === value ? date.toISOString() : null;
}
export function workInterval(work: ProductionWork): { start: number; end: number } | null {
  if (!work.machineId || !work.scheduledStart || !work.estimatedMinutes) return null;
  const start = Date.parse(work.scheduledStart), end = start + work.estimatedMinutes * 60000;
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}
export function productionWarnings(work: ProductionWork[], now = Date.now()) {
  const conflicts = new Set<string>(), late = new Set<string>();
  const pending = work.filter(item => item.state === 'todo');
  const lanes = new Map<string, { work: ProductionWork; start: number; end: number }[]>();
  for (const item of pending) {
    const interval = workInterval(item);
    if (interval) { const lane = lanes.get(item.machineId!) ?? []; lane.push({ work: item, ...interval }); lanes.set(item.machineId!, lane); }
    if (item.dueDate) {
      const deadline = new Date(item.dueDate + 'T00:00:00'); deadline.setDate(deadline.getDate() + 1);
      if (now > deadline.getTime() || (interval?.end ?? 0) > deadline.getTime()) late.add(item.id);
    }
  }
  for (const lane of lanes.values()) {
    lane.sort((a, b) => a.start - b.start);
    for (let i = 0; i < lane.length; i++) for (let j = i + 1; j < lane.length && lane[j]!.start < lane[i]!.end; j++) {
      conflicts.add(lane[i]!.work.id); conflicts.add(lane[j]!.work.id);
    }
  }
  return { conflicts, late };
}
export function visibleDays(anchor: string, count: number) {
  let start = new Date(anchor + 'T00:00:00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || !Number.isFinite(start.getTime()) || localDateTime(start.toISOString()).slice(0, 10) !== anchor || start.getFullYear() < 1900 || start.getFullYear() > 9998) { start = new Date(); start.setHours(0, 0, 0, 0); }
  count = count === 1 ? 1 : 7;
  return Array.from({ length: count + 1 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
}
/** Drop coordinates map to elapsed time within the selected local day (including DST). */
export function dropInstant(start: Date, end: Date, fraction: number): string {
  const raw = start.getTime() + Math.max(0, Math.min(.999, fraction)) * (end.getTime() - start.getTime());
  const rounded = Math.round(raw / 300000) * 300000;
  return new Date(Math.min(end.getTime() - 300000, Math.max(start.getTime(), rounded))).toISOString();
}
