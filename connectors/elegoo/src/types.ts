import type { IClientOptions, MqttClient } from 'mqtt';
import type { DiagnosticPort, ReportPorts } from '../../../packages/connector-sdk/src/index.ts';

export interface CC2Connection {
  origin: string;
  accessCode: string;
  serial?: string | undefined;
}
export interface CC2Machine extends CC2Connection { id: string; serial: string }
export type CC2Status = 'connecting' | 'ready' | 'printing' | 'paused' | 'done' | 'error' | 'offline';
export interface CC2Snapshot {
  status: CC2Status;
  issue: string | null;
  nozzle: number | null;
  bed: number | null;
  progress: number;
  file: string;
  serial?: string;
  filaments?: unknown;
}
export type CC2Identity = { serial: string } | (CC2Snapshot & { serial?: never });
export interface CC2Report {
  machine_status?: { status?: number; sub_status?: number; progress?: unknown };
  extruder?: { temperature?: unknown };
  heater_bed?: { temperature?: unknown };
  print_status?: { filename?: unknown };
  /** État de l'éclairage du caisson : `status` 1 allumé, 0 éteint (méthode 1029 pour le modifier). */
  led?: { status?: unknown };
  /** Ventilateurs : `speed` en PWM 0–255, `rpm` éventuel (méthode 1030 pour `fan`, `aux_fan`, `box_fan`). */
  fans?: Record<string, { speed?: unknown; rpm?: unknown }>;
  /** Position commandée en mm (`gcode_move`, avec `speed_mode` 0–3 pour la méthode 1031, `gcode_move_inf` sur d'anciens firmwares). */
  gcode_move?: Record<string, unknown>;
  gcode_move_inf?: Record<string, unknown>;
  /** Axes à l'origine (`homed_axes`, par exemple `xyz`) ; `toolhead` sur certains firmwares. */
  tool_head?: Record<string, unknown>;
  toolhead?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface CC2Result extends CC2Report { error_code?: number; file_list?: unknown }
export interface CC2Message { error?: unknown; id?: number; method?: number; result?: CC2Result }
export type CC2Connect = (origin: string, options: IClientOptions) => MqttClient;
export interface CC2Options {
  fetcher?: typeof fetch;
  connectPrinter?: CC2Connect;
  signal?: AbortSignal | undefined;
}
export interface CC2MonitorOptions extends CC2Options { now?: () => number; diagnostics?: DiagnosticPort }
export type CC2Ports = ReportPorts<CC2Report, unknown, unknown>;
