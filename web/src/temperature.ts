import type { MachineData } from './types.js';
export interface TemperatureSample { at: number; nozzle: number | null; bed: number | null }
export type TemperatureHistory = ReadonlyMap<string, TemperatureSample[]>;
const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** Mesures datées uniquement ; 30 minutes, au plus un point par 10 secondes. */
export function recordTemperatures(history: TemperatureHistory, machines: MachineData[]): TemperatureHistory {
  const out = new Map<string, TemperatureSample[]>(); let changed = false;
  for (const machine of machines) {
    const previous = history.get(machine.id) ?? []; out.set(machine.id, previous);
    const at = typeof machine.checkedAt === 'string' ? Date.parse(machine.checkedAt) : NaN;
    const nozzle = numeric(machine.nozzle), bed = numeric(machine.bed);
    if (!Number.isFinite(at) || ['offline', 'connecting'].includes(machine.status) || (nozzle === null && bed === null) || (previous.length && at - previous.at(-1)!.at < 10000)) continue;
    out.set(machine.id, [...previous.filter(p => at - p.at <= 1800000), { at, nozzle, bed }]); changed = true;
  }
  return changed || out.size !== history.size || [...out.keys()].some(key => !history.has(key)) ? out : history;
}
