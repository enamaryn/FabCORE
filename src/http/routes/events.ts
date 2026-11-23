import type { RawHandler, RouteModule } from '../app.ts';
import { errorResponses } from '../errors.ts';

/** Flux d'événements SSE (ADR 0004) : session requise ; le gestionnaire tient la connexion ouverte. */
export interface EventHandlers {
  stream: RawHandler;
}

export const eventRoutes = (handlers: EventHandlers): RouteModule => (app, guards) => {
  const signedIn = (request: Parameters<typeof guards.signedIn>[0]) => guards.signedIn(request);
  app.get('/api/events', {
    onRequest: guards.raw(handlers.stream, signedIn),
    schema: {
      summary: 'Flux d’événements temps réel (SSE) : machine.telemetry, fleet.changed, resync',
      description: 'Authentifié par le cookie de session. `Last-Event-ID` permet la reprise ; `resync` demande de recharger l’état par REST. Commentaire de maintien toutes les 15 s.',
      tags: ['temps réel'], security: [{ session: [] }],
      response: { 200: { description: 'Flux `text/event-stream`.' }, ...errorResponses(401, 421) },
    },
  }, async () => undefined);
};
