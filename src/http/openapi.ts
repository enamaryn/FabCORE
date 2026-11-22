import { createHttpApp } from './app.ts';
import { migratedRoutes } from './routes/index.ts';

/** Document OpenAPI des routes migrées, produit sans aucune dépendance réelle (stockage, sessions, machines). */
export async function openApiDocument(): Promise<unknown> {
  const unused = () => { throw new Error('unused'); };
  const http = createHttpApp({ allowedHost: 'fabcore.invalid', viewer: () => null }, migratedRoutes({
    session: { installed: unused, oidcEnabled: unused, viewer: () => null },
    diagnostics: { view: unused, fleet: unused },
  }));
  await http.ready;
  const document = http.app.swagger();
  await http.close();
  return document;
}
