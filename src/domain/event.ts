import Type from 'typebox';
import { CommandResult } from './command.ts';
import { Connection } from './machine.ts';
import { Telemetry } from './telemetry.ts';

const envelope = <Name extends string, Data extends Type.TSchema>(type: Name, data: Data) => Type.Object({
  /** Identifiant croissant par instance serveur, repris par `Last-Event-ID` (ADR 0004). */
  id: Type.String({ minLength: 1, maxLength: 64 }),
  type: Type.Literal(type),
  at: Type.String({ format: 'date-time' }),
  data,
}, { additionalProperties: false });

/** Événements diffusés en SSE : ils signalent un changement, l'état de référence reste l'API REST. */
export const DomainEvent = Type.Union([
  envelope('machine.telemetry', Telemetry),
  envelope('machine.connection', Connection),
  envelope('command.result', CommandResult),
  /** Parc modifié (ajout, édition, suppression, bobine manuelle) : `machineId` concerné, `null` si plusieurs. */
  envelope('fleet.changed', Type.Object({ machineId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]) }, { additionalProperties: false })),
  /** Le client doit recharger l'état complet : identifiant de reprise trop ancien ou serveur redémarré. */
  envelope('projects.changed', Type.Object({}, { additionalProperties: false })),
  envelope('resync', Type.Object({}, { additionalProperties: false })),
]);

export type DomainEvent = Type.Static<typeof DomainEvent>;
export type DomainEventType = DomainEvent['type'];
