import type { RouteModule } from '../app.ts';
import { accountRoutes, type AccountDependencies } from './accounts.ts';
import { diagnosticsRoutes, type DiagnosticsDependencies } from './diagnostics.ts';
import { eventRoutes, type EventHandlers } from './events.ts';
import { fleetRoutes, type FleetDependencies } from './fleet.ts';
import { logRoutes, type LogDependencies } from './logs.ts';
import { machineRoutes, type MachineDependencies } from './machines.ts';
import { notificationRoutes, type NotificationDependencies } from './notifications.ts';
import { operationRoutes, type OperationHandlers } from './operations.ts';
import { pageRoutes, type PageHandlers } from './pages.ts';
import { sessionRoutes, type SessionDependencies } from './session.ts';
import { versionRoutes, type VersionDependencies } from './version.ts';

export interface RouteDependencies {
  accounts: AccountDependencies;
  session: SessionDependencies;
  diagnostics: DiagnosticsDependencies;
  fleet: FleetDependencies;
  machines: MachineDependencies;
  notifications: NotificationDependencies;
  logs: LogDependencies;
  events: EventHandlers;
  version: VersionDependencies;
  operations: OperationHandlers;
  pages: PageHandlers;
}

/** Liste unique des routes du serveur : utilisée par le serveur et par la génération OpenAPI. */
export const migratedRoutes = (dependencies: RouteDependencies): RouteModule[] => [
  sessionRoutes(dependencies.session),
  accountRoutes(dependencies.accounts),
  diagnosticsRoutes(dependencies.diagnostics),
  fleetRoutes(dependencies.fleet),
  machineRoutes(dependencies.machines),
  notificationRoutes(dependencies.notifications),
  logRoutes(dependencies.logs),
  eventRoutes(dependencies.events),
  versionRoutes(dependencies.version),
  operationRoutes(dependencies.operations),
  pageRoutes(dependencies.pages),
];
