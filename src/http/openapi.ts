import { createHttpApp } from './app.ts';
import { migratedRoutes } from './routes/index.ts';

/** Document OpenAPI des routes migrées, produit sans aucune dépendance réelle (stockage, sessions, machines). */
export async function openApiDocument(): Promise<unknown> {
  const unused = () => { throw new Error('unused'); };
  const http = createHttpApp({ allowedHost: 'fabcore.invalid', origin: 'https://fabcore.invalid', limit: () => true, viewer: () => null }, migratedRoutes({
    accounts: { installed: unused, setup: unused, login: unused, logout: unused, addObserver: unused },
    session: { installed: unused, oidcEnabled: unused, viewer: () => null },
    diagnostics: { view: unused, fleet: unused },
    fleet: { list: unused },
    notifications: { view: unused, save: unused, test: unused },
    logs: { machine: unused, machineLog: unused, cloudAccounts: unused, cloudLog: unused, cloudFailure: unused },
  }));
  await http.ready;
  const document = http.app.swagger();
  await http.close();
  return document;
}
