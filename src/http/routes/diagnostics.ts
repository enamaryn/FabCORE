import Type from 'typebox';
import type { RouteModule } from '../app.ts';
import { errorResponses } from '../errors.ts';

export const Diagnostics = Type.Object({
  fleet: Type.Array(Type.Object({ id: Type.String(), name: Type.String() }, { additionalProperties: false })),
}, {
  // Le contenu détaillé du diagnostic est produit par le POC et n'est pas encore figé : conservé tel quel.
  additionalProperties: true,
  description: 'Compteurs et journaux de diagnostic du serveur, et liste des machines (identifiant, nom).',
});

export interface DiagnosticsDependencies {
  view(): Record<string, unknown>;
  fleet(): { id: string; name: string }[];
}

/** Diagnostic serveur, réservé aux administrateurs. */
export const diagnosticsRoutes = (dependencies: DiagnosticsDependencies): RouteModule => (app, guards) => {
  app.get('/api/diagnostics', {
    schema: {
      summary: 'Diagnostic du serveur et du parc',
      tags: ['administration'],
      security: [{ session: [] }],
      response: { 200: Diagnostics, ...errorResponses(401, 403, 421) },
    },
  }, async request => {
    guards.admin(request);
    return { ...dependencies.view(), fleet: dependencies.fleet() };
  });
};
