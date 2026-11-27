// Nivellement 4 points (tramming) Klipper/Moonraker, façon assistant MRiscoC : quatre palpages aux coins
// atteignables par la sonde, écart de chaque coin par rapport au coin de référence (avant gauche) et planéité
// (écart maximal). Un appel = un point : le navigateur affiche chaque mesure et peut arrêter entre deux points.
// Aucun rejeu : une commande de palpage interrompue reste « inconnue ».
import type { MoonrakerConnection, MoonrakerFetch } from './types.ts';

export type TrammingCorner = 'front-left' | 'front-right' | 'back-right' | 'back-left';
export const trammingCorners: TrammingCorner[] = ['front-left', 'front-right', 'back-right', 'back-left'];
export interface TrammingPoint { corner: TrammingCorner; x: number; y: number }
export interface TrammingGeometry { available: boolean; reason?: 'no-probe' | 'no-geometry'; offset?: { x: number; y: number }; points?: TrammingPoint[] }
export interface TrammingMeasure { corner: TrammingCorner; x: number; y: number; z: number }
export interface TrammingResult { at: string; points: TrammingMeasure[]; range: number; deviations: { corner: TrammingCorner; delta: number }[] }

/** Marge entre les points palpés et les bords atteignables (mm). */
export const trammingInset = 25;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Quatre points de palpage (coordonnées sonde) dans la zone que la buse peut atteindre, sonde décalée comprise. */
export function trammingPoints(minimum: number[], maximum: number[], offset: { x: number; y: number }, inset = trammingInset): TrammingPoint[] | null {
  if (![minimum[0], minimum[1], maximum[0], maximum[1], offset.x, offset.y].every(finite)) return null;
  // Sonde = buse + décalage ; elle doit aussi rester au-dessus du plateau (0 … maximum).
  const span = (axis: 0 | 1, shift: number) => {
    const low = Math.max(minimum[axis]! + shift, 0) + inset, high = Math.min(maximum[axis]! + shift, maximum[axis]!) - inset;
    return high - low >= 20 ? [round(low, 2), round(high, 2)] as const : null;
  };
  const x = span(0, offset.x), y = span(1, offset.y);
  if (!x || !y) return null;
  return [{ corner: 'front-left', x: x[0], y: y[0] }, { corner: 'front-right', x: x[1], y: y[0] }, { corner: 'back-right', x: x[1], y: y[1] }, { corner: 'back-left', x: x[0], y: y[1] }];
}

/** Écarts par rapport au coin avant gauche (positif = coin plus haut, à abaisser) et planéité = max - min. */
export function trammingResult(points: TrammingMeasure[], at = new Date().toISOString()): TrammingResult | null {
  if (points.length !== 4 || trammingCorners.some((corner, index) => points[index]?.corner !== corner) || !points.every(point => finite(point.z))) return null;
  const reference = points[0]!.z, values = points.map(point => point.z);
  return { at, points: points.map(point => ({ ...point, z: round(point.z) })), range: round(Math.max(...values) - Math.min(...values)), deviations: points.map(point => ({ corner: point.corner, delta: round(point.z - reference) })) };
}

/** Résultat relu depuis le stockage : rejeté s'il n'a pas exactement la forme attendue. */
export function storedTramming(value: unknown): TrammingResult | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<TrammingResult>;
  if (typeof data.at !== 'string' || !Number.isFinite(Date.parse(data.at)) || !Array.isArray(data.points)) return null;
  return trammingResult(data.points.map(point => ({ corner: point?.corner, x: Number(point?.x), y: Number(point?.y), z: Number(point?.z) })) as TrammingMeasure[], data.at);
}

export function createMoonrakerTramming({ validOrigin, readResponse }: { validOrigin(origin: string): string | null; readResponse(response: Response): Promise<unknown> }, fetcher: MoonrakerFetch = fetch) {
  const call = (machine: MoonrakerConnection, path: string, options: RequestInit & { timeout?: number } = {}) => {
    if (validOrigin(machine.origin) !== machine.origin) throw new Error('tramming-unavailable');
    return fetcher(machine.origin + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(options.timeout ?? 8000), headers: { ...(machine.apiKey ? { 'X-Api-Key': machine.apiKey } : {}), ...options.headers } });
  };
  async function query(machine: MoonrakerConnection, objects: string) {
    const response = await call(machine, '/printer/objects/query?' + objects, { method: 'GET' });
    if (!response.ok) { await response.body?.cancel(); throw new Error('tramming-unavailable'); }
    return ((await readResponse(response)) as { result?: { status?: Record<string, Record<string, unknown>> } })?.result?.status ?? {};
  }
  async function script(machine: MoonrakerConnection, gcode: string, timeout: number) {
    const response = await call(machine, '/printer/gcode/script', { method: 'POST', timeout, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script: gcode }) });
    if (!response.ok) {
      const body = await readResponse(response).catch(() => null) as { error?: { message?: unknown } } | null;
      const message = typeof body?.error?.message === 'string' ? body.error.message.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
      throw Object.assign(new Error('tramming-failed'), { nativeMessage: message });
    }
    await response.body?.cancel();
  }
  async function geometry(machine: MoonrakerConnection): Promise<TrammingGeometry & { homed?: string; state?: string; printState?: string }> {
    const status = await query(machine, 'configfile=settings&toolhead&print_stats&webhooks');
    const settings = (status.configfile?.settings ?? {}) as Record<string, Record<string, unknown> | undefined>;
    const probe = settings.bltouch ?? settings.probe ?? settings.beacon ?? settings.cartographer ?? settings.eddy ?? null;
    if (!probe) return { available: false, reason: 'no-probe' };
    const offset = { x: Number(probe.x_offset ?? 0), y: Number(probe.y_offset ?? 0) };
    const toolhead = status.toolhead ?? {};
    const minimum = toolhead.axis_minimum as number[] | undefined, maximum = toolhead.axis_maximum as number[] | undefined;
    const points = minimum && maximum ? trammingPoints(minimum, maximum, offset) : null;
    if (!points) return { available: false, reason: 'no-geometry' };
    return { available: true, offset, points, homed: String(toolhead.homed_axes ?? ''), state: String(status.webhooks?.state ?? ''), printState: String(status.print_stats?.state ?? '') };
  }
  return {
    geometry,
    /** Palpe un point (0 à 3). Origine faite d'abord si besoin. Refusé si Klipper n'est pas prêt ou imprime. */
    async measure(machine: MoonrakerConnection, index: number, canWrite = () => true): Promise<TrammingMeasure> {
      const current = await geometry(machine);
      if (!current.available || !current.points || !current.offset) throw new Error('tramming-unavailable');
      if (current.state !== 'ready' || ['printing', 'paused'].includes(current.printState ?? '')) throw new Error('tramming-state');
      const point = current.points[index];
      if (!point) throw new Error('tramming-invalid');
      if (!canWrite()) throw new Error('command-busy');
      const nozzleX = round(point.x - current.offset.x, 2), nozzleY = round(point.y - current.offset.y, 2);
      const home = ['x', 'y', 'z'].every(axis => current.homed?.includes(axis)) ? '' : 'G28\n';
      await script(machine, `${home}G90\nG1 Z5 F600\nG1 X${nozzleX} Y${nozzleY} F6000\nPROBE`, 180_000);
      const z = Number((await query(machine, 'probe')).probe?.last_z_result);
      if (!Number.isFinite(z)) throw new Error('tramming-failed');
      return { corner: point.corner, x: point.x, y: point.y, z: round(z) };
    },
    /** Remonte la buse après la dernière mesure (un seul envoi). */
    async finish(machine: MoonrakerConnection) { await script(machine, 'G90\nG1 Z10 F600', 30_000); },
  };
}
