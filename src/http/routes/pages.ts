import type { RawHandler, RouteModule } from '../app.ts';
import { errorResponses } from '../errors.ts';

export interface PageHandlers {
  asset: RawHandler;
  oidc: RawHandler;
}

/** Interface web et connexion OIDC, publiques ; chemin exact comme le POC. */
export const pageRoutes = (handlers: PageHandlers): RouteModule => (app, guards) => {
  const none = async () => undefined;
  for (const path of ['/', '/shared.js', '/live.js', '/cloud.js', '/gcode.mjs', '/favicon.svg']) {
    app.get(path, { config: { query: path === '/' }, onRequest: guards.raw(handlers.asset), schema: { hide: true } }, none);
  }
  app.get('/api/oidc/start', {
    onRequest: guards.raw(handlers.oidc),
    schema: { summary: 'Démarrer une connexion OIDC (HTTPS, installation terminée)', tags: ['session'], response: { 303: { description: 'Redirection vers le fournisseur.' }, ...errorResponses(404, 421, 429) } },
  }, none);
  app.get('/api/oidc/callback', {
    config: { query: true },
    onRequest: guards.raw(handlers.oidc),
    schema: { summary: 'Retour du fournisseur OIDC', tags: ['session'], response: { 303: { description: 'Redirection vers l’interface, session ouverte ou échec signalé.' }, ...errorResponses(404, 421) } },
  }, none);
};
