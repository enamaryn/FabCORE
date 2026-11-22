import type { RouteModule } from '../app.ts';
import { diagnosticsRoutes, type DiagnosticsDependencies } from './diagnostics.ts';
import { sessionRoutes, type SessionDependencies } from './session.ts';

export interface RouteDependencies {
  session: SessionDependencies;
  diagnostics: DiagnosticsDependencies;
}

/** Liste unique des routes migrées : utilisée par le serveur et par la génération OpenAPI. */
export const migratedRoutes = (dependencies: RouteDependencies): RouteModule[] => [
  sessionRoutes(dependencies.session),
  diagnosticsRoutes(dependencies.diagnostics),
];
