import Type from 'typebox';
import type { RouteModule } from '../app.ts';
import { errorResponses } from '../errors.ts';

export const NotificationSettings = Type.Object({
  ntfy: Type.Object({ mode: Type.String() }, { additionalProperties: true, description: 'Réglages ntfy, sans secret.' }),
  smtp: Type.Object({ enabled: Type.Boolean() }, { additionalProperties: true, description: 'Réglages SMTP, sans secret.' }),
  internal: Type.Union([Type.Object({ url: Type.String(), topic: Type.String() }, { additionalProperties: false }), Type.Null()]),
}, { additionalProperties: false });

export interface NotificationDependencies {
  /** Réglages publics : les secrets ntfy et SMTP ne sont jamais renvoyés. */
  view(): Type.Static<typeof NotificationSettings>;
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
};
