import Type from 'typebox';
import { Capabilities, type CommandAction } from './capabilities.ts';
import type { CommandResult } from './command.ts';
import { ConnectorId } from './machine.ts';
import type { Telemetry } from './telemetry.ts';

/**
 * Description publique d'un connecteur, disponible sans charger son client réseau.
 * `timing` conserve les temporisations du POC : supervision continue (`live`),
 * intervalle de relecture en millisecondes (`interval`, `null` = valeur par défaut du serveur)
 * et vérification d'identité avant enregistrement (`verify`).
 */
export const ConnectorManifest = Type.Object({
  id: ConnectorId,
  model: Type.String({ minLength: 1, maxLength: 120 }),
  form: Type.String({ pattern: '^[a-z][a-z0-9-]*$', maxLength: 40 }),
  port: Type.Union([Type.Integer({ minimum: 1, maximum: 65535 }), Type.Null()]),
  credentialsRequired: Type.Boolean(),
  capabilities: Capabilities,
  timing: Type.Object({
    live: Type.Boolean(),
    interval: Type.Union([Type.Integer({ minimum: 500, maximum: 600_000 }), Type.Null()]),
    verify: Type.Boolean(),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

export type ConnectorManifest = Type.Static<typeof ConnectorManifest>;

/**
 * Cycle de vie d'un connecteur : ouvrir, lire, commander, fermer (`forget` par machine, `close` du registre pour tout).
 * `TMachine` est l'enregistrement de connexion propre au connecteur (adresse, identifiants…),
 * opaque pour le domaine.
 */
export interface ConnectorLifecycle<TMachine> {
  /** Charge le connecteur une seule fois et réutilise sa session ; aucune commande n'est émise à l'ouverture. */
  open(): Promise<void>;
  /** Lit un instantané ; toute valeur non remontée reste `null`. */
  read(machine: TMachine & { id: string }, options?: { signal?: AbortSignal }): Promise<Telemetry>;
  /**
   * Envoie une commande une seule fois, sans rejeu. Le résultat vaut au mieux `accepted` :
   * la confirmation relève de la supervision, pas du transport.
   */
  command(machine: TMachine & { id: string }, action: CommandAction, commandId: string): Promise<CommandResult>;
  /** Ferme la session d'une machine (suppression ou changement de configuration). La fermeture globale relève du registre. */
  forget(machineId: string, changed: boolean): void;
}
