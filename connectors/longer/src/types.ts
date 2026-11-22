import type { EventEmitter } from 'node:events';
import type { DiagnosticPort } from '../../../packages/connector-sdk/src/index.ts';

export interface Ray5Connection { id: string; origin: string; wsPort?: number; httpPort?: number }
export interface Ray5Target { host: string; port: number; wsPort: number; transport: 'tcp' | 'esp3d' }
export interface Ray5Position { x: number; y: number; z: number | null }
export interface Ray5Snapshot {
  status: string; issue: string | null; nozzle: null; bed: null; progress: number;
  progressKnown: boolean; file: string; machinePosition: Ray5Position | null; workPosition: Ray5Position | null;
  feedRate: number | null; spindle: number | null; nativeState?: string; firmware?: string | null; checkedAt?: string;
}
export interface Ray5Socket extends EventEmitter {
  writableLength?: number;
  write?(data: string | Buffer): unknown;
  destroy?(): unknown;
  terminate?(): unknown;
}
export interface Ray5Ports { privateIPv4(host: string): boolean; openWS(url: string): Ray5Socket }
export interface Ray5Options {
  connectTCP?: (options: { host: string; port: number }) => Ray5Socket;
  openWS?: (url: string) => Ray5Socket;
  fetcher?: typeof fetch;
  diagnostics?: DiagnosticPort;
  now?: () => number;
  pollMs?: number; staleMs?: number; retryMs?: number; probeMs?: number; idleMs?: number;
}
export interface Ray5Command { action: string; axis?: string; distance?: number; value?: number; duration?: number; operatorPresent?: boolean }
export interface Ray5Pending { remaining: number; resolve(ok: boolean): void; reject(error: Error): void }
export interface Ray5Entry {
  key: string; machine: Ray5Connection; target: Ray5Target; waiters: Set<() => void>; stopped: boolean;
  current: Ray5Snapshot | null; reportAt: number | null; openedAt: number; buffer: string;
  settings: Record<string, number>; queried: boolean; initialized: boolean; page: string | null;
  retryAt: number; failures: number; issue: string | null;
  firmware?: string | null; revision?: number; connected?: boolean;
  socket?: Ray5Socket | null; request?: AbortController | null; pending?: Ray5Pending | null;
  poll?: ReturnType<typeof setInterval>; idle?: ReturnType<typeof setTimeout>;
}
