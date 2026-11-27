import { createHttpApp } from './app.ts';
import { migratedRoutes } from './routes/index.ts';

/** Document OpenAPI des routes migrées, produit sans aucune dépendance réelle (stockage, sessions, machines). */
export async function openApiDocument(): Promise<unknown> {
  const unused = () => { throw new Error('unused'); };
  const http = createHttpApp({ allowedHost: 'fabcore.invalid', origin: 'https://fabcore.invalid', limit: () => true, viewer: () => null }, migratedRoutes({
    projects: { list: () => ({ version: 1, projects: [], work: [] }), create: async () => { throw new Error('unused'); }, update: async () => { throw new Error('unused'); }, beginExecution: async () => { throw new Error('unused'); }, finishExecution: async () => { throw new Error('unused'); }, observeExecution: async () => { throw new Error('unused'); }, previewReplan: async () => { throw new Error('unused'); }, applyReplan: async () => { throw new Error('unused'); }, saveWork: async () => { throw new Error('unused'); } },
    accounts: { installed: unused, setup: unused, login: unused, logout: unused, addObserver: unused },
    session: { installed: unused, oidcEnabled: unused, viewer: () => null },
    diagnostics: { view: unused, fleet: unused },
    fleet: { list: unused },
    machines: { write: unused, spool: unused, networks: unused, discover: unused },
    notifications: { view: unused, save: unused, test: unused },
    logs: { machine: unused, machineLog: unused, cloudAccounts: unused, cloudLog: unused, cloudFailure: unused },
    events: { stream: unused },
    version: { status: async () => ({ current: null, latest: null, updateAvailable: false, checkedAt: null }) },
    operations: { cloudCertificates: unused, cloudAction: unused, camera: unused, command: unused, controls: unused, terminal: unused, files: unused },
    pages: { asset: unused, oidc: unused },
  }));
  await http.ready;
  const document = http.app.swagger();
  await http.close();
  return document;
}
