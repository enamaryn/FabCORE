import type { RouteModule } from '../app.ts';
import { diagnosticsRoutes, type DiagnosticsDependencies } from './diagnostics.ts';
import { fleetRoutes, type FleetDependencies } from './fleet.ts';
import { logRoutes, type LogDependencies } from './logs.ts';
import { notificationRoutes, type NotificationDependencies } from './notifications.ts';
import { sessionRoutes, type SessionDependencies } from './session.ts';

export interface RouteDependencies {
  session: SessionDependencies;
  diagnostics: DiagnosticsDependencies;
  fleet: FleetDependencies;
  notifications: NotificationDependencies;
  logs: LogDependencies;
}

/** Liste unique des routes migrées : utilisée par le serveur et par la génération OpenAPI. */
export const migratedRoutes = (dependencies: RouteDependencies): RouteModule[] => [
  sessionRoutes(dependencies.session),
  diagnosticsRoutes(dependencies.diagnostics),
  fleetRoutes(dependencies.fleet),
  notificationRoutes(dependencies.notifications),
  logRoutes(dependencies.logs),
];
