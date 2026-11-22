import Type from 'typebox';

/** Commandes de fabrication réellement implémentées par un connecteur (CONNECTORS.md). */
export const CommandAction = Type.Union([Type.Literal('start'), Type.Literal('pause'), Type.Literal('resume'), Type.Literal('stop')]);
export type CommandAction = Type.Static<typeof CommandAction>;

export const FileFamily = Type.Union([Type.Literal('fdm'), Type.Literal('laser')]);
export type FileFamily = Type.Static<typeof FileFamily>;

/**
 * Capacités déclarées par un connecteur ou restreintes par une fiche modèle (ADR 0006).
 * Une capacité absente vaut `false` : rien n'est supposé disponible sans déclaration.
 */
export const Capabilities = Type.Object({
  camera: Type.Boolean(),
  commands: Type.Boolean(),
  commandActions: Type.Array(CommandAction, { uniqueItems: true }),
  files: Type.Boolean(),
  /** Seules les copies des envois FabCore sont listées, pas l'inventaire natif. */
  retainedOnly: Type.Boolean(),
  projects: Type.Boolean(),
  externalFilament: Type.Boolean(),
  terminal: Type.Boolean(),
  /** Système multi-filament remonté par la machine, ou `null` s'il n'y en a pas. */
  filaments: Type.Union([Type.String({ minLength: 1, maxLength: 40 }), Type.Null()]),
  temperatures: Type.Boolean(),
  printJob: Type.Boolean(),
  controls: Type.Boolean(),
  fileFamily: FileFamily,
}, { additionalProperties: false });

export type Capabilities = Type.Static<typeof Capabilities>;

/** Une restriction (fiche modèle) ne peut jamais ajouter une capacité absente du connecteur. */
export function restrictCapabilities(base: Capabilities, restriction: Partial<Capabilities>): Capabilities {
  const flag = (key: Exclude<keyof Capabilities, 'commandActions' | 'filaments' | 'fileFamily'>): boolean =>
    base[key] && (restriction[key] ?? true);
  return {
    camera: flag('camera'),
    commands: flag('commands'),
    commandActions: base.commandActions.filter(action => restriction.commandActions?.includes(action) ?? true),
    files: flag('files'),
    retainedOnly: base.retainedOnly || (restriction.retainedOnly ?? false),
    projects: flag('projects'),
    externalFilament: flag('externalFilament'),
    terminal: flag('terminal'),
    filaments: base.filaments !== null && restriction.filaments !== null ? base.filaments : null,
    temperatures: flag('temperatures'),
    printJob: flag('printJob'),
    controls: flag('controls'),
    fileFamily: base.fileFamily,
  };
}
