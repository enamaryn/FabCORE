import Type from 'typebox';
import { JsonBody, type RouteModule } from '../app.ts';
import { errorResponses } from '../errors.ts';

export const NotificationSettings = Type.Object({
  ntfy: Type.Object({ mode: Type.String() }, { additionalProperties: true, description: 'Réglages ntfy, sans secret.' }),
  smtp: Type.Object({ enabled: Type.Boolean() }, { additionalProperties: true, description: 'Réglages SMTP, sans secret.' }),
  internal: Type.Union([Type.Object({ url: Type.String(), topic: Type.String() }, { additionalProperties: false }), Type.Null()]),
}, { additionalProperties: false });

export interface NotificationDependencies {
  /** Réglages publics : les secrets ntfy et SMTP ne sont jamais renvoyés. */
  view(): Type.Static<typeof NotificationSettings>;
  /** Enregistre les réglages (secret conservé s'il n'est pas ressaisi) et renvoie leur forme publique. */
  save(data: Record<string, unknown>): Type.Static<typeof NotificationSettings> | Promise<Type.Static<typeof NotificationSettings>>;
  /** Envoie une notification de test ; aucune réponse du fournisseur n'est renvoyée. */
  test(data: Record<string, unknown>): Promise<{ accepted: true }>;
}

export const notificationRoutes = (dependencies: NotificationDependencies): RouteModule => (app, guards) => {
  app.get('/api/notifications', {
    schema: {
      summary: 'Réglages des notifications, sans secret',
      tags: ['administration'],
      security: [{ session: [] }],
      response: { 200: NotificationSettings, ...errorResponses(401, 403, 421) },
    },
  }, async request => {
    guards.admin(request);
    return dependencies.view();
  });
  // Écritures : droits d'abord, puis origine et type de contenu, avant lecture du corps (ordre du POC).
  const write = { onRequest: async (request: Parameters<typeof guards.admin>[0]) => { guards.admin(request); guards.json(request); } };
  app.post<{ Body: Record<string, unknown> }>('/api/notifications', {
    ...write,
    schema: { summary: 'Enregistrer les réglages des notifications', tags: ['administration'], security: [{ session: [] }], body: JsonBody,
      response: { 200: NotificationSettings, ...errorResponses(400, 401, 403, 415, 421) } },
  }, async request => dependencies.save(request.body));
  app.post<{ Body: Record<string, unknown> }>('/api/notifications/test', {
    ...write,
    schema: { summary: 'Envoyer une notification de test (ntfy ou smtp)', tags: ['administration'], security: [{ session: [] }], body: JsonBody,
      response: { 200: Type.Object({ accepted: Type.Literal(true) }, { additionalProperties: false }), ...errorResponses(400, 401, 403, 415, 421, 429, 502) } },
  }, async request => dependencies.test(request.body));
};
