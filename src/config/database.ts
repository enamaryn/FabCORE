// Configuration PostgreSQL (ADR 0007) : schéma TypeBox unique. Sources par priorité : variables d'environnement,
// puis fichier de configuration `FABCORE_CONFIG` (lignes NOM=valeur, mode 0600). Valeur invalide : refus de
// démarrer avec un code explicite ; aucun secret dans les messages.
import { readFileSync, statSync } from 'node:fs';
import Type from 'typebox';
import Value from 'typebox/value';

export const DatabaseConfig = Type.Object({
  url: Type.String({ pattern: '^postgres(ql)?://', maxLength: 2048 }),
  /** disable : sans TLS ; require : TLS sans vérification ; verify-full : certificat et nom vérifiés. Absent : l'URL décide. */
  ssl: Type.Optional(Type.Union([Type.Literal('disable'), Type.Literal('require'), Type.Literal('verify-full')])),
  /** Autorité de certification (PEM) pour verify-full, si elle n'est pas dans le magasin du système. */
  caFile: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
  poolMax: Type.Integer({ minimum: 2, maximum: 50 }),
  connectTimeoutMs: Type.Integer({ minimum: 1000, maximum: 60_000 }),
}, { additionalProperties: false });
export type DatabaseConfig = Type.Static<typeof DatabaseConfig>;

/** Erreur de configuration : `code` stable et nom de la variable fautive, jamais sa valeur. */
export class ConfigError extends Error {
  readonly variable: string;
  constructor(code: string, variable: string) {
    super(code);
    this.variable = variable;
  }
}

const keys = { url: 'FABCORE_DATABASE_URL', ssl: 'FABCORE_DATABASE_SSL', caFile: 'FABCORE_DATABASE_CA_FILE', poolMax: 'FABCORE_DATABASE_POOL_MAX', connectTimeoutMs: 'FABCORE_DATABASE_CONNECT_TIMEOUT_MS' } as const;

/** Lit un fichier NOM=valeur (format EnvironmentFile de systemd) ; refuse un fichier lisible par d'autres. */
export function readConfigFile(path: string): Record<string, string> {
  let mode: number;
  try { mode = statSync(path).mode; } catch { throw new ConfigError('config-missing', 'FABCORE_CONFIG'); }
  if (mode & 0o077) throw new ConfigError('config-permissions', 'FABCORE_CONFIG');
  const values: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) throw new ConfigError('config-syntax', 'FABCORE_CONFIG');
    values[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/** Configuration de la base, ou `null` si aucune URL n'est définie (stockage state.json). */
export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig | null {
  const file = env.FABCORE_CONFIG ? readConfigFile(env.FABCORE_CONFIG) : {};
  const value = (name: string) => env[name] || file[name] || undefined;
  const url = value(keys.url);
  if (!url) return null;
  const integer = (name: string, fallback: number) => { const raw = value(name); return raw === undefined ? fallback : /^\d+$/.test(raw) ? Number(raw) : NaN; };
  const config = {
    url, ...(value(keys.ssl) ? { ssl: value(keys.ssl) } : {}), ...(value(keys.caFile) ? { caFile: value(keys.caFile) } : {}),
    poolMax: integer(keys.poolMax, 4), connectTimeoutMs: integer(keys.connectTimeoutMs, 10_000),
  };
  const error = Value.Errors(DatabaseConfig, config)[0];
  if (error) {
    const field = error.instancePath.split('/')[1] as keyof typeof keys | undefined;
    throw new ConfigError('config-invalid', field ? keys[field] : keys.url);
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new ConfigError('config-invalid', keys.url); }
  // TLS décidé à un seul endroit : la variable FABCORE_DATABASE_SSL ou les paramètres de l'URL, pas les deux.
  if (config.ssl && ['sslmode', 'ssl', 'sslrootcert'].some(name => parsed.searchParams.has(name))) throw new ConfigError('config-ssl-conflict', keys.ssl);
  if (config.caFile && config.ssl !== 'verify-full') throw new ConfigError('config-invalid', keys.caFile);
  return config as DatabaseConfig;
}

/** Options TLS du pilote pg. */
export function pgSsl(config: DatabaseConfig): false | { rejectUnauthorized: boolean; ca?: string } | undefined {
  if (!config.ssl) return undefined;
  if (config.ssl === 'disable') return false;
  if (config.ssl === 'require') return { rejectUnauthorized: false };
  let ca: string | undefined;
  if (config.caFile) {
    try { ca = readFileSync(config.caFile, 'utf8'); } catch { throw new ConfigError('config-ca-unreadable', keys.caFile); }
  }
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}
