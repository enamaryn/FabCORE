// Bus d'événements SSE (ADR 0004, MIG-05.1). Identifiants « <démarrage>:<numéro> » croissants par instance ;
// tampon de reprise borné ; filtrage par droits avant émission ; abonnés lents déconnectés plutôt que de
// faire grossir la mémoire. Les événements signalent un changement : l'état de référence reste l'API REST.
import { randomBytes } from 'node:crypto';
import Value from 'typebox/value';
import { DomainEvent, type DomainEventType } from '../domain/index.ts';

export type Viewer = { role: 'admin' | 'observer' };
/** Portée : `all` (toute session, comme les lectures du parc) ou `admin` (administration). */
export type Scope = 'all' | 'admin';
type Stored = { seq: number; id: string; scope: Scope; frame: string };
export type Subscriber = { viewer: Viewer; write(frame: string): boolean; close(): void };

export type EventHubOptions = {
  /** Événements conservés pour la reprise (`Last-Event-ID`). */
  capacity?: number;
  /** Taille maximale d'un message sérialisé, en octets. */
  maxFrameBytes?: number;
  /** Trames en attente tolérées par abonné avant déconnexion (abonné lent). */
  maxPending?: number;
  now?: () => Date;
};

const visible = (scope: Scope, viewer: Viewer) => scope === 'all' || viewer.role === 'admin';

export function createEventHub({ capacity = 500, maxFrameBytes = 16 * 1024, maxPending = 256, now = () => new Date() }: EventHubOptions = {}) {
  const boot = randomBytes(4).toString('hex');
  const buffer: Stored[] = [];
  const subscribers = new Map<Subscriber, { pending: number }>();
  let seq = 0;

  const frame = (id: string, type: string, data: unknown) => `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  function deliver(subscriber: Subscriber, text: string) {
    const entry = subscribers.get(subscriber);
    if (!entry) return;
    // write() renvoie false quand le tampon du socket est plein : au-delà de maxPending trames, l'abonné est fermé
    // et se reconnectera avec Last-Event-ID (reprise ou resync), sans bloquer les autres.
    if (subscriber.write(text)) entry.pending = 0;
    else if (++entry.pending > maxPending) { subscribers.delete(subscriber); subscriber.close(); }
  }

  return {
    get size() { return subscribers.size; },
    /** Publie un événement validé par le schéma ; renvoie son identifiant, ou `null` s'il est refusé. */
    publish<Type extends DomainEventType>(type: Type, data: Extract<DomainEvent, { type: Type }>['data'], scope: Scope = 'all'): string | null {
      const id = `${boot}:${seq + 1}`;
      const event = { id, type, at: now().toISOString(), data };
      if (!Value.Check(DomainEvent, event)) return null;
      const text = frame(id, type, event);
      if (Buffer.byteLength(text) > maxFrameBytes) return null;
      seq += 1;
      buffer.push({ seq, id, scope, frame: text });
      if (buffer.length > capacity) buffer.shift();
      for (const subscriber of [...subscribers.keys()]) if (visible(scope, subscriber.viewer)) deliver(subscriber, text);
      return id;
    },
    /**
     * Abonne un flux. Avec `lastEventId` du même démarrage et encore dans le tampon : rejoue la suite visible.
     * Sinon (autre démarrage, trop ancien, invalide) : un unique `resync`, le client recharge par REST.
     */
    subscribe(subscriber: Subscriber, lastEventId?: string | null): () => void {
      subscribers.set(subscriber, { pending: 0 });
      if (lastEventId) {
        const [from, raw] = lastEventId.split(':');
        const last = Number(raw);
        const oldest = buffer[0]?.seq ?? seq + 1;
        if (from === boot && Number.isInteger(last) && last <= seq && last >= oldest - 1) {
          for (const stored of buffer) if (stored.seq > last && visible(stored.scope, subscriber.viewer)) deliver(subscriber, stored.frame);
        } else {
          const id = `${boot}:${seq}`;
          deliver(subscriber, frame(id, 'resync', { id, type: 'resync', at: now().toISOString(), data: {} }));
        }
      }
      return () => { subscribers.delete(subscriber); };
    },
    /** Ferme les flux d'une session révoquée ou expirée. */
    close(match: (subscriber: Subscriber) => boolean) {
      for (const subscriber of [...subscribers.keys()]) if (match(subscriber)) { subscribers.delete(subscriber); subscriber.close(); }
    },
  };
}
export type EventHub = ReturnType<typeof createEventHub>;
