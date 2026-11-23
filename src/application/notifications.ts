// Réglages des notifications (ntfy, SMTP) : validation, conservation des secrets et service d'administration.
// L'envoi réel (HTTP ntfy, SMTP) est injecté : `poc/notifications.mjs` → `sendNotification`.
import { ServiceError } from './errors.ts';
import type { FabCoreState, StateStore } from './state-store.ts';

type Ntfy = { mode: 'off' | 'internal' | 'external'; url?: string; topic?: string; auth?: 'none' | 'basic' | 'bearer'; username?: string; secret?: string };
type Smtp = { enabled: boolean; host?: string; port?: number; tls?: 'tls' | 'starttls'; from?: string; to?: string; auth?: boolean; username?: string; secret?: string };
export type NotificationConfig = { ntfy?: Ntfy; smtp?: Smtp };
export type InternalNtfy = { url: string; topic: string; username: string; secret: string };
type Input = Record<string, unknown>;

const topicPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const mailAddress = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
// eslint-disable-next-line no-control-regex -- refuse exprès les caractères de contrôle (même règle que le POC)
const text = (input: unknown, limit: number) => typeof input === 'string' && input.length <= limit && !/[\x00-\x1f\x7f]/.test(input) ? input : '';
/** Saisie refusée : code stable `notifications-invalid` et champ en cause (`smtp.from`, `ntfy.url`…), jamais sa valeur. */
export class NotificationInputError extends Error {
  readonly field: string;
  constructor(field: string) { super('notifications-invalid'); this.field = field; }
}
const invalid = (field: string): never => { throw new NotificationInputError(field); };
const object = (value: unknown): Input => value && typeof value === 'object' && !Array.isArray(value) ? value as Input : {};
/** `assumeStoredSecret` : contrôle côté interface, qui ne connaît pas les secrets conservés par le serveur. */
type Options = { assumeStoredSecret?: boolean };

/** Canal ntfy seul ; un secret vide conserve l'ancien si la connexion est inchangée. */
export function ntfySettings(ntfy: Input, previous: Ntfy | undefined, internal?: InternalNtfy | null, { assumeStoredSecret = false }: Options = {}): Ntfy {
  if (!['off', 'internal', 'external'].includes(ntfy.mode as string)) invalid('ntfy.mode');
  if (ntfy.mode === 'internal' && !internal) throw new Error('ntfy-install-required');
  if (ntfy.mode !== 'external') return { mode: ntfy.mode as Ntfy['mode'] };
  let url: URL | undefined;
  try { url = new URL(text(ntfy.url, 256)); } catch { invalid('ntfy.url'); }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) invalid('ntfy.url');
  if (typeof ntfy.topic !== 'string' || !topicPattern.test(ntfy.topic)) invalid('ntfy.topic');
  const auth = ntfy.auth as Ntfy['auth'];
  if (!['none', 'basic', 'bearer'].includes(auth as string)) invalid('ntfy.auth');
  const username = auth === 'basic' ? text(ntfy.username, 128) : '';
  if (auth === 'basic' && (!username || username.includes(':'))) invalid('ntfy.username');
  const destination = url!.href.replace(/\/+$/, '');
  const keep = previous?.mode === 'external' && previous.url === destination && previous.topic === ntfy.topic && previous.auth === auth && previous.username === username;
  const secret = text(ntfy.secret, 512) || (ntfy.secret === '' && keep ? previous?.secret ?? (assumeStoredSecret ? 'stored' : '') : '');
  if (auth !== 'none' && !secret) invalid('ntfy.secret');
  return { mode: 'external', url: destination, topic: ntfy.topic as string, auth: auth!, username, secret: auth === 'none' ? '' : secret };
}

/** Canal SMTP seul ; un mot de passe vide conserve l'ancien si serveur, port, chiffrement et identifiant sont inchangés. */
export function smtpSettings(smtp: Input, previous: Smtp | undefined, { assumeStoredSecret = false }: Options = {}): Smtp {
  if (typeof smtp.enabled !== 'boolean') invalid('smtp.enabled');
  if (!smtp.enabled) return { enabled: false };
  const host = text(smtp.host, 253).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(host)) invalid('smtp.host');
  const port = Number(smtp.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) invalid('smtp.port');
  const tls = smtp.tls as Smtp['tls'];
  if (!['tls', 'starttls'].includes(tls as string)) invalid('smtp.tls');
  const from = text(smtp.from, 254), to = text(smtp.to, 254), username = text(smtp.username, 128);
  if (!mailAddress.test(from)) invalid('smtp.from');
  if (!mailAddress.test(to)) invalid('smtp.to');
  if (typeof smtp.auth !== 'boolean') invalid('smtp.auth');
  const keep = previous?.host === host && previous.port === port && previous.tls === tls && previous.auth === smtp.auth && previous.username === username;
  const secret = text(smtp.secret, 512) || (smtp.secret === '' && keep ? previous?.secret ?? (assumeStoredSecret ? 'stored' : '') : '');
  if (smtp.auth && !username) invalid('smtp.username');
  if (smtp.auth && !secret) invalid('smtp.secret');
  return { enabled: true, host, port, tls: tls!, from, to, auth: smtp.auth as boolean, username: smtp.auth ? username : '', secret: smtp.auth ? secret : '' };
}

/**
 * Valide une saisie. Chaque canal présent est validé seul ; un canal absent garde sa configuration, pour qu'un canal
 * incomplet ne bloque jamais l'autre (#121). Erreurs : `notifications-invalid` (avec le champ), `ntfy-install-required`.
 */
export function notificationSettings(input: Input, previous: NotificationConfig = {}, internal?: InternalNtfy | null): NotificationConfig {
  if (!('ntfy' in input) && !('smtp' in input)) invalid('channel');
  return {
    ntfy: 'ntfy' in input ? ntfySettings(object(input.ntfy), previous.ntfy, internal) : previous.ntfy ?? { mode: 'off' },
    smtp: 'smtp' in input ? smtpSettings(object(input.smtp), previous.smtp) : previous.smtp ?? { enabled: false },
  };
}

/** Forme publique : jamais de secret. */
export function publicNotifications(config: NotificationConfig = {}, internal?: InternalNtfy | null) {
  const { secret: _ntfy, ...ntfy } = config.ntfy ?? { mode: 'off' as const };
  const { secret: _smtp, ...smtp } = config.smtp ?? { enabled: false };
  return { ntfy, smtp, internal: internal ? { url: internal.url, topic: internal.topic } : null };
}

export type NotificationServiceDependencies = {
  store: StateStore;
  persist: (next: FabCoreState) => Promise<void>;
  /** ntfy interne provisionné par l'installation, ou `null`. */
  internal: () => InternalNtfy | null;
  /** Envoi d'un test ; `true` seulement si le fournisseur a accepté. */
  send: (channel: 'ntfy' | 'smtp', config: NotificationConfig, internal: InternalNtfy | null) => Promise<boolean>;
  /** Limite de débit partagée du serveur ; `false` si dépassée. */
  withinLimit: (key: string) => boolean;
};

export function createNotificationService({ store, persist, internal, send, withinLimit }: NotificationServiceDependencies) {
  const current = () => (store.state.notifications ?? {}) as NotificationConfig;
  const testing = new Set<string>();
  return {
    view: () => publicNotifications(current(), internal()),
    async save(data: Input) {
      const ntfy = internal();
      let settings: NotificationConfig;
      try { settings = notificationSettings(data, current(), ntfy); }
      catch (failure) { throw new ServiceError(400, (failure as Error).message === 'ntfy-install-required' ? 'ntfy-install-required' : 'notifications-invalid'); }
      await persist({ ...store.state, notifications: settings });
      return publicNotifications(settings, ntfy);
    },
    async test(data: Input): Promise<{ accepted: true }> {
      const channel = data.channel;
      if (channel !== 'ntfy' && channel !== 'smtp') throw new ServiceError(400, 'invalid');
      if (testing.has(channel) || !withinLimit('/api/notifications/test/' + channel)) throw new ServiceError(429, 'rate');
      testing.add(channel);
      try {
        if (await send(channel, current(), internal())) return { accepted: true };
      } catch { /* Réponse du fournisseur jamais renvoyée : elle peut contenir des secrets. */ }
      finally { testing.delete(channel); }
      throw new ServiceError(502, 'notifications-failed');
    },
  };
}
