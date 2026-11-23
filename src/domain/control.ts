/** Reported equipment only; absence never implies a physical device is absent. */
export interface ControlState {
  status?: string;
  lights: { id: string; value: boolean | null; writable: boolean }[];
  heaters: { id: string; current: number | null; target: number | null; max: number; writable: boolean }[];
  fans: { id: string; percent: number | null; rpm: number | null; writable: boolean }[];
  speed?: { mode: number; writable: boolean };
  motion: { homed: string | null; axes?: string[]; home?: boolean; fabcoreHoming?: boolean; position?: number[]; minimum?: number[]; maximum?: number[]; gcode?: number[] } | null;
  laser?: { writable: boolean; mode: boolean; max: number | null; nativeState: string } | null;
}
export type ControlCommand = Record<string, unknown>;

/** Canonical pure parameter validation, shared with the HTTP command path.
 * Role, current machine state and command locks remain server responsibilities. */
export function validateControl(data: ControlCommand | null | undefined, controls: ControlState): ControlCommand | null {
  if (data?.confirm !== true) return null;
  if (data.action === 'light' && typeof data.value === 'boolean' && controls.lights.some(item => item.id === data.id && item.writable)) return { action: 'light', id: data.id, value: data.value };
  if (data.action === 'heat' && typeof data.value === 'number' && Number.isInteger(data.value)) {
    const item = controls.heaters.find(item => item.id === data.id && item.writable);
    if (item && data.value >= 0 && data.value <= item.max) return { action: 'heat', id: data.id, value: data.value };
  }
  if (data.action === 'speed' && typeof data.value === 'number' && Number.isInteger(data.value) && data.value >= 0 && data.value <= 3 && controls.speed?.writable) return { action: 'speed', value: data.value };
  if (data.action === 'fan' && typeof data.value === 'number' && Number.isInteger(data.value) && data.value >= 0 && data.value <= 100 && controls.fans.some(item => item.id === data.id && item.writable)) return { action: 'fan', id: data.id, value: data.value };
  if (controls.laser?.writable) {
    if (typeof data.action === 'string' && ['laser-off','zero','unlock','reset','jog-cancel'].includes(data.action)) return { action: data.action };
    if (data.action === 'laser-pulse' && data.operatorPresent === true && controls.laser.mode && (controls.laser.max ?? 0) > 0 && typeof data.value === 'number' && Number.isInteger(data.value) && data.value >= 1 && data.value <= 5 && typeof data.duration === 'number' && [100,250,500].includes(data.duration)) return { action: data.action, value: data.value, duration: data.duration, operatorPresent: true };
  }
  if (data.action === 'home' && controls.motion && controls.motion.home !== false) return { action: 'home' };
  if (data.action === 'move' && controls.motion && typeof data.axis === 'string' && ['X', 'Y', 'Z'].includes(data.axis) && [0.1, 1, 10].includes(Math.abs(data.distance as number))) {
    const motion = controls.motion;
    if (motion.axes && !motion.axes.includes(data.axis)) return null;
    const index = ['X', 'Y', 'Z'].indexOf(data.axis);
    if (motion.homed !== null) {
      if (!['x', 'y', 'z'].every(axis => motion.homed?.includes(axis))) return null;
      if (![motion.position?.[index], motion.minimum?.[index], motion.maximum?.[index], motion.gcode?.[index]].every(Number.isFinite)) return null;
      const next = motion.position![index]! + (data.distance as number);
      if (next < motion.minimum![index]! || next > motion.maximum![index]!) return null;
    }
    return { action: 'move', axis: data.axis, distance: data.distance };
  }
  return null;
}
