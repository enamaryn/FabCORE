import Type from 'typebox';
import { ErrorCode } from './error.ts';

export const MachineStatus = Type.Union([
  Type.Literal('ready'),
  Type.Literal('printing'),
  Type.Literal('paused'),
  Type.Literal('done'),
  Type.Literal('error'),
  Type.Literal('offline'),
  /** Aucun rapport exploitable : ne jamais le remplacer par un état supposé. */
  Type.Literal('unknown'),
]);
export type MachineStatus = Type.Static<typeof MachineStatus>;

const Celsius = Type.Union([Type.Number({ minimum: -50, maximum: 600 }), Type.Null()]);

/**
 * Instantané de supervision. Toute valeur non remontée vaut `null`.
 * Le POC utilise encore `''` pour un fichier inconnu et `0` de progression hors ligne :
 * l'adaptation vers ce contrat (MIG-02) les convertit en `null`.
 */
export const Telemetry = Type.Object({
  machineId: Type.String({ format: 'uuid' }),
  at: Type.String({ format: 'date-time' }),
  status: MachineStatus,
  issue: Type.Union([ErrorCode, Type.Null()]),
  nozzle: Celsius,
  bed: Celsius,
  /** Progression en pourcentage, ou `null` si inconnue. */
  progress: Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]),
  file: Type.Union([Type.String({ minLength: 1, maxLength: 512 }), Type.Null()]),
}, { additionalProperties: false });

export type Telemetry = Type.Static<typeof Telemetry>;
