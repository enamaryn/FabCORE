import type { IClientOptions, MqttClient } from 'mqtt';
import type { DiagnosticPort } from '../../../packages/connector-sdk/src/index.ts';

export interface P2SConnection {
  id: string;
  origin: string;
  serial: string;
  accessCode: string;
}
export type P2SStatus = 'connecting' | 'ready' | 'printing' | 'paused' | 'done' | 'error' | 'offline';
export interface P2SSnapshot {
  status: P2SStatus;
  issue: string | null;
  nozzle: number | null;
  bed: number | null;
  progress: number;
  file: string;
  filaments?: unknown;
}
export type P2SReport = Record<string, unknown>;
export interface P2SHeater { id: string; current?: unknown }
export interface P2SControls { heaters: P2SHeater[]; [key: string]: unknown }
export type P2SChannel = 'print' | 'system' | 'info';
export type P2SConnect = (origin: string, options: IClientOptions) => MqttClient;

/** Projections et certificat partagés avec d'autres modules du POC, injectés par la composition. */
export interface P2SPorts {
  ca: Buffer;
  reportedControls(kind: 'bambu', report: P2SReport): P2SControls;
  bambuFilaments(ams: Record<string, unknown>): unknown;
}
export interface P2SMonitorOptions extends P2SPorts {
  connectPrinter?: P2SConnect;
  diagnostics?: DiagnosticPort | undefined;
}
export interface P2SFilePorts {
  ca: Buffer;
  productionPath(path: string): unknown;
}
