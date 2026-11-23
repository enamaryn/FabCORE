import type { Static } from 'typebox';
import type { FleetMachine } from '../../src/http/routes/fleet.js';

export interface FilamentSlot {
  id: number;
  occupied?: boolean | null;
  color?: string | null;
  material?: string | null;
  name?: string | null;
  active?: boolean;
}
export interface FilamentUnit {
  id: number;
  variant?: string | null;
  slots: FilamentSlot[];
  humidity?: number | null;
}
export interface ManualSpool {
  material?: string | null;
  name?: string | null;
  color?: string | null;
}
/** Stable API contract plus optional, reported presentation telemetry. */
export type MachineData = Static<typeof FleetMachine> & {
  model?: string | null;
  nozzle?: number | null;
  bed?: number | null;
  progress?: number | null;
  progressKnown?: boolean;
  file?: string | null;
  checkedAt?: string | null;
  filaments?: FilamentUnit[] | null;
  manualSpool?: ManualSpool | null;
  issue?: string | null;
};
export interface ActivityEntry {
  id: string;
  machineId: string;
  machineName: string;
  status: MachineData['status'];
  at: string;
}
