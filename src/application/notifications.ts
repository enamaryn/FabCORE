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
const invalid = (): never => { throw new Error('notifications-invalid'); };
const object = (value: unknown): Input => value && typeof value === 'object' && !Array.isArray(value) ? value as Input : {};

/** Valide une saisie ; un secret vide conserve l'ancien si la connexion est inchangée. Erreurs : `notifications-invalid`, `ntfy-install-required`. */
export function notificationSettings(input: Input, previous: NotificationConfig = {}, internal?: InternalNtfy | null): NotificationConfig {
  const ntfy = object(input.ntfy), smtp = object(input.smtp);
  if (!['off', 'internal', 'external'].includes(ntfy.mode as string) || typeof smtp.enabled !== 'boolean') invalid();
  const config: NotificationConfig = { ntfy: { mode: ntfy.mode as Ntfy['mode'] } };
  if (ntfy.mode === 'internal' && !internal) throw new Error('ntfy-install-required');
  if (ntfy.mode === 'external') {
    let url: URL | undefined;
    try { url = new URL(text(ntfy.url, 256)); } catch { invalid(); }
    const auth = ntfy.auth as Ntfy['auth'];
    const username = auth === 'basic' ? text(ntfy.username, 128) : '';
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        typeof ntfy.topic !== 'string' || !topicPattern.test(ntfy.topic) ||
        !['none', 'basic', 'bearer'].includes(auth as string) || (auth === 'basic' && (!username || username.includes(':')))) invalid();
    const destination = url!.href.replace(/\/+$/, '');
    const old = previous.ntfy;
    const keep = old?.mode === 'external' && old.url === destination && old.topic === ntfy.topic && old.auth === auth && old.username === username;
    const secret = text(ntfy.secret, 512) || (ntfy.secret === '' && keep ? old.secret ?? '' : '');
    if (auth !== 'none' && !secret) invalid();
    config.ntfy = { mode: 'external', url: destination, topic: ntfy.topic as string, auth: auth!, username, secret: auth === 'none' ? '' : secret };
  }
  config.smtp = { enabled: smtp.enabled as boolean };
  if (smtp.enabled) {
    const host = text(smtp.host, 253).trim().toLowerCase();
    const port = Number(smtp.port);
    const tls = smtp.tls as Smtp['tls'];
    const from = text(smtp.from, 254), to = text(smtp.to, 254), username = text(smtp.username, 128);
    if (!/^[a-z0-9][a-z0-9.-]*$/i.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 ||
        !['tls', 'starttls'].includes(tls as string) || !mailAddress.test(from) || !mailAddress.test(to) || typeof smtp.auth !== 'boolean') invalid();
    const old = previous.smtp;
    const keep = old?.host === host && old.port === port && old.tls === tls && old.auth === smtp.auth && old.username === username;
    const secret = text(smtp.secret, 512) || (smtp.secret === '' && keep ? old?.secret ?? '' : '');
    if (smtp.auth && (!username || !secret)) invalid();
    config.smtp = { enabled: true, host, port, tls: tls!, from, to, auth: smtp.auth as boolean, username: smtp.auth ? username : '', secret: smtp.auth ? secret : '' };
  }
  return config;
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
