import Type from 'typebox';

/** Code stable traduit par l'interface (ADR 0005) : `machine.offline`, `command.rejected`… */
export const ErrorCode = Type.String({ pattern: '^[a-z][a-z0-9-]*(\\.[a-z0-9-]+)*$', maxLength: 120 });

/**
 * Erreur exposée hors du serveur : jamais de texte affiché, uniquement un code et ses paramètres.
 * `detail` transporte un message brut du firmware ou du constructeur, marqué comme non traduit.
 */
export const FabError = Type.Object({
  code: ErrorCode,
  params: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]))),
  detail: Type.Optional(Type.String({ maxLength: 2000 })),
}, { additionalProperties: false });

export type FabError = Type.Static<typeof FabError>;
