// Adaptation typée du registre de connecteurs du POC (MIG-02.1).
// Les protocoles, sessions, identifiants et temporisations restent ceux de poc/connectors.mjs ;
// ce module ne fait que valider les métadonnées et normaliser lectures et résultats vers le domaine.
import Value from 'typebox/value';
import { connectorCatalog, connectorDefinition, createConnectorRegistry } from '../../poc/connectors.mjs';
import {
  ConnectorManifest, ErrorCode, type CommandAction, type CommandResult, type ConnectorLifecycle,
  type MachineStatus, type Telemetry,
} from '../domain/index.ts';

/** Forme minimale d'une définition du POC, lue sans charger le client réseau. */
interface LegacyDefinition {
  model: string;
  form: string;
  port?: number | '';
  required?: boolean;
  live?: boolean;
  interval?: number;
  verify?: boolean;
}

/** Connecteur chargé par le registre du POC. */
interface LegacyConnector {
  read(machine: unknown, options?: { signal?: AbortSignal }): Promise<Record<string, unknown>>;
  command?(machine: unknown, action: CommandAction): Promise<unknown>;
}

interface LegacyRegistry {
  get(kind: string): Promise<LegacyConnector | null>;
  forget(kind: string, id: string, changed: boolean): void;
  close(): void;
}

const statuses: readonly MachineStatus[] = ['ready', 'printing', 'paused', 'done', 'error', 'offline', 'unknown'];

/** Construit et valide le manifeste d'un connecteur du POC. Lève une erreur si la déclaration est invalide. */
export function connectorManifest(kind: string): ConnectorManifest {
  const definition = connectorDefinition(kind) as LegacyDefinition | null;
  const catalog = (connectorCatalog as Record<string, Record<string, unknown>>)[kind];
  if (!definition || !catalog) throw new Error(`connector.unknown:${kind}`);
  const { model, form, port, required, ...capabilities } = catalog;
  const manifest = {
    id: kind,
    model: definition.model,
    form: definition.form,
    port: typeof definition.port === 'number' ? definition.port : null,
    credentialsRequired: definition.required === true,
    capabilities,
    timing: { live: definition.live === true, interval: definition.interval ?? null, verify: definition.verify === true },
  };
  if (!Value.Check(ConnectorManifest, manifest)) {
    const [first] = Value.Errors(ConnectorManifest, manifest);
    throw new Error(`connector.manifest-invalid:${kind}:${first?.instancePath ?? ''} ${first?.message ?? ''}`.trim());
  }
  return manifest;
}

/** Manifestes de tous les connecteurs déclarés, validés au démarrage. */
export const connectorManifests = (): ConnectorManifest[] => Object.keys(connectorCatalog).map(connectorManifest);

const celsius = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= -50 && value <= 600 ? value : null;

/**
 * Convertit une lecture du POC vers le contrat du domaine sans rien inventer :
 * statut inconnu → `unknown`, fichier vide → `null`, progression hors ligne ou hors bornes → `null`.
 */
export function normalizeTelemetry(machineId: string, raw: Record<string, unknown>, at: Date): Telemetry {
  const status = statuses.includes(raw.status as MachineStatus) ? raw.status as MachineStatus : 'unknown';
  const progress = raw.progress;
  const file = typeof raw.file === 'string' ? raw.file.trim() : '';
  return {
    machineId,
    at: at.toISOString(),
    status,
    issue: typeof raw.issue === 'string' && Value.Check(ErrorCode, raw.issue) ? raw.issue : raw.issue == null || raw.issue === '' ? null : 'connector.issue-unrecognized',
    nozzle: celsius(raw.nozzle),
    bed: celsius(raw.bed),
    progress: status !== 'offline' && status !== 'unknown' && typeof progress === 'number' && Number.isFinite(progress) && progress >= 0 && progress <= 100 ? progress : null,
    file: file && file.length <= 512 ? file : null,
  };
}

/** Erreurs du POC qui signifient un refus certain plutôt qu'un résultat inconnu. */
const refusals = new Set(['bambu-authorization']);

export interface TypedConnectorRegistry {
  manifest(kind: string): ConnectorManifest;
  connector<TMachine>(kind: string): ConnectorLifecycle<TMachine>;
  /** Ferme toutes les sessions ; aucun connecteur n'est rouvert ensuite. */
  close(): void;
}

/**
 * Enveloppe le registre du POC : une seule instance par type de connecteur, sessions et
 * temporisations inchangées. `registry` est injectable pour les tests.
 */
export function createTypedConnectorRegistry(options: Record<string, unknown>, registry?: LegacyRegistry, now: () => Date = () => new Date()): TypedConnectorRegistry {
  const legacy = registry ?? createConnectorRegistry(options) as LegacyRegistry;
  const manifests = new Map<string, ConnectorManifest>();
  const manifest = (kind: string): ConnectorManifest => {
    let found = manifests.get(kind);
    if (!found) manifests.set(kind, found = connectorManifest(kind));
    return found;
  };
  const load = async (kind: string): Promise<LegacyConnector> => {
    const connector = await legacy.get(kind);
    if (!connector) throw new Error('connector.unavailable');
    return connector;
  };
  return {
    manifest,
    connector<TMachine>(kind: string): ConnectorLifecycle<TMachine> {
      const declared = manifest(kind);
      return {
        async open() { await load(kind); },
        async read(machine, readOptions) {
          const connector = await load(kind);
          return normalizeTelemetry(machine.id, await connector.read(machine, readOptions), now());
        },
        async command(machine, action, commandId): Promise<CommandResult> {
          const result = (outcome: CommandResult['outcome'], code?: string): CommandResult =>
            ({ commandId, outcome, at: now().toISOString(), ...(code ? { error: { code } } : {}) });
          if (!declared.capabilities.commands || !declared.capabilities.commandActions.includes(action)) return result('rejected', 'command.unsupported');
          const connector = await load(kind);
          if (!connector.command) return result('rejected', 'command.unsupported');
          try {
            return await connector.command(machine, action) ? result('accepted') : result('rejected', 'command.rejected');
          } catch (failure) {
            const code = failure instanceof Error ? failure.message : '';
            // La commande a pu atteindre la machine : jamais de rejeu automatique.
            return refusals.has(code) ? result('rejected', code) : result('unknown', 'command.unconfirmed');
          }
        },
        forget(machineId, changed) { legacy.forget(kind, machineId, changed); },
      };
    },
    close() { legacy.close(); },
  };
}
