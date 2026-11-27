import type { bambuCameraInfo } from '../../src/domain/camera.ts';
import type { Static } from 'typebox';
import type { FleetMachine, FleetCapabilities } from '../../src/http/routes/fleet.js';

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
export type MachineCapabilities = Static<typeof FleetCapabilities>;
/** Stable API contract plus optional, reported presentation telemetry. */
export type MachineData = Static<typeof FleetMachine> & {
  camera?: ReturnType<typeof bambuCameraInfo>;
  model?: string | null;
  serial?: string | null;
  origin?: string;
  capabilities?: MachineCapabilities;
  transport?: string;
  nativeStatus?: number | null;
  /** Message texte remonté par la machine (Klipper : erreur d'impression ou arrêt). */
  nativeMessage?: string;
  nativeSubStatus?: number | null;
  exceptionCodes?: number[];
  nativeState?: string;
  firmware?: string;
  feedRate?: number | null;
  spindle?: number | null;
  nozzle?: number | null;
  bed?: number | null;
  progress?: number | null;
  progressKnown?: boolean;
  file?: string | null;
  filePath?: string | null;
  filePosition?: number | null;
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
