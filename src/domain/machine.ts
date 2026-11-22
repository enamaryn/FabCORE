import Type from 'typebox';

/** Une machine utilise un seul transport configuré, sans bascule implicite (MVP-00.8). */
export const Transport = Type.Union([Type.Literal('lan'), Type.Literal('cloud')]);
export type Transport = Type.Static<typeof Transport>;

/** Identifiant de connecteur (`elegoo`, `bambu`, `moonraker`…). */
export const ConnectorId = Type.String({ pattern: '^[a-z][a-z0-9-]*$', maxLength: 60 });

export const Machine = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String({ minLength: 1, maxLength: 120 }),
  connector: ConnectorId,
  transport: Transport,
  /** Identité réellement renvoyée par la machine, ou `null` si le protocole ne la fournit pas. */
  serial: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
  model: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
  firmware: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
}, { additionalProperties: false });

export type Machine = Type.Static<typeof Machine>;

/**
 * État de la session de transport, distinct de l'état de fabrication :
 * découverte, connexion authentifiée et supervision opérationnelle ne se confondent pas.
 */
export const ConnectionState = Type.Union([
  Type.Literal('connecting'),
  Type.Literal('connected'),
  Type.Literal('disconnected'),
  /** Authentification à renouveler par l'utilisateur ; aucune nouvelle tentative automatique en boucle. */
  Type.Literal('reauth'),
]);
export type ConnectionState = Type.Static<typeof ConnectionState>;

export const Connection = Type.Object({
  machineId: Type.String({ format: 'uuid' }),
  transport: Transport,
  state: ConnectionState,
  /** Horodatage ISO du dernier rapport reçu, ou `null` si aucun. */
  lastReportAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
}, { additionalProperties: false });

export type Connection = Type.Static<typeof Connection>;
