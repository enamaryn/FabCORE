// Identifiant de corrélation par requête (MIG-03.2.2) : repris d'un en-tête `X-Request-Id` valide
// (proxy amont), sinon généré ; renvoyé dans la réponse et ajouté aux journaux écrits pendant la requête.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const storage = new AsyncLocalStorage<{ requestId: string; active: boolean }>();

/**
 * Identifiant de la requête en cours, ou `undefined` hors requête. Une session machine ouverte pendant
 * une requête hérite du contexte asynchrone : l'identifiant cesse d'être renvoyé dès la fin de la réponse,
 * pour ne jamais rattacher les traces ultérieures de cette session à une requête terminée.
 */
export const currentRequestId = (): string | undefined => {
  const store = storage.getStore();
  return store?.active ? store.requestId : undefined;
};

/** Valeur entrante acceptée seulement si elle est courte et sans caractère spécial : jamais de contenu libre dans les journaux. */
export const requestIdFrom = (header: unknown): string =>
  typeof header === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(header) ? header : randomUUID();

/** Exécute `run` dans le contexte de la requête ; le contexte expire à la fermeture de `response`. */
export function withRequestId<T>(requestId: string, response: { once(event: 'close', listener: () => void): unknown }, run: () => T): T {
  const context = { requestId, active: true };
  response.once('close', () => { context.active = false; });
  return storage.run(context, run);
}
