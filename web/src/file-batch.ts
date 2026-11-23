import type { MachineData } from './types.ts';

export type BatchPhase = 'queued' | 'running' | 'success' | 'error';
export type BatchResult<T, V> = { item: T; ok: true; value: V } | { item: T; ok: false; error: unknown };
export const fileFamily = (machine: MachineData) => machine.capabilities?.fileFamily ?? 'fdm';
export const connectionSignature = (machine: MachineData) => JSON.stringify([machine.kind, machine.origin, machine.transport, 'serial' in machine ? machine.serial : null]);
export const safetySignature = (machine: MachineData) => JSON.stringify([connectionSignature(machine), fileFamily(machine), !!machine.capabilities?.externalFilament]);
export function transferCandidates(source: MachineData, path: string, machines: MachineData[]) {
  return machines.filter(machine => machine.id !== source.id && machine.capabilities?.files === true &&
    fileFamily(machine) === fileFamily(source) && (!/\.3mf$/i.test(path) || machine.capabilities?.projects === true));
}
export function canCopy(source: MachineData | undefined, destination: MachineData | undefined, path: string, role: string) {
  return role === 'admin' && !!source && !!destination && source.capabilities?.files === true &&
    !['offline', 'connecting'].includes(source.status) && !['offline', 'connecting'].includes(destination.status) &&
    [source, destination].every(machine => machine.kind !== 'longer-ray5' || ['ready', 'done'].includes(machine.status)) &&
    transferCandidates(source, path, [destination]).length === 1;
}
export function canLaunch(machine: MachineData | undefined, role: string) {
  return role === 'admin' && !!machine && machine.capabilities?.files === true && machine.capabilities?.printJob !== false && machine.transport !== 'esp3d' &&
    ['ready', 'done'].includes(machine.status);
}
export function authorizationLost(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && ['sign-in', 'forbidden'].includes(String(error.code));
}
/** One attempt per item, serially. Cancellation stops the next operation even if an API ignores abort. */
export async function runFileBatch<T, V>(items: readonly T[], operation: (item: T) => Promise<V>, options: {
  signal: AbortSignal;
  started?(item: T): void;
  changed?(result: BatchResult<T, V>): void;
  stopOnError?(error: unknown): boolean;
  skipped?(item: T): void;
}) {
  const results: BatchResult<T, V>[] = [];
  for (const [index, item] of items.entries()) {
    if (options.signal.aborted) break;
    options.started?.(item);
    if (options.signal.aborted) break;
    let result: BatchResult<T, V>;
    try { result = { item, ok: true, value: await operation(item) }; }
    catch (error) { result = { item, ok: false, error }; }
    results.push(result);
    if (!options.signal.aborted) options.changed?.(result);
    if (!result.ok && options.stopOnError?.(result.error)) {
      for (const pending of items.slice(index + 1)) {
        if (options.signal.aborted) break;
        options.skipped?.(pending);
      }
      break;
    }
  }
  return results;
}
