import Type from 'typebox';
import type { RawHandler, RouteModule } from '../app.ts';
import { errorResponses } from '../errors.ts';

/**
 * Opérations sur les machines et comptes cloud, en mode brut : le socle applique hôte, en-têtes et premier
 * contrôle de droits ; le gestionnaire garde l'ordre historique des contrôles suivants (machine, origine,
 * corps, état), ses flux (fichiers, caméras), son annulation et son absence de rejeu.
 */
export interface OperationHandlers {
  cloudAction: RawHandler;
  cloudCertificates: RawHandler;
  camera: RawHandler;
  command: RawHandler;
  controls: RawHandler;
  terminal: RawHandler;
  files: RawHandler;
}

const id = ':id([a-f0-9-]{36})';
const Params = Type.Object({ id: Type.String() });
const session = [{ session: [] }];
const json = (description: string) => ({ description, content: { 'application/json': { schema: Type.Object({}, { additionalProperties: true }) } } });

export const operationRoutes = (handlers: OperationHandlers): RouteModule => (app, guards) => {
  const admin = (request: Parameters<typeof guards.admin>[0]) => guards.admin(request);
  const signedIn = (request: Parameters<typeof guards.signedIn>[0]) => guards.signedIn(request);
  const none = async () => undefined;

  app.get('/api/cloud-certificates', {
    onRequest: guards.raw(handlers.cloudCertificates, admin),
    schema: { summary: 'État des certificats applicatifs Bambu importés (sans secret)', tags: ['cloud'], security: session,
      response: { 200: json('Métadonnées uniquement'), ...errorResponses(401, 403, 421, 503) } },
  }, none);
  app.post('/api/cloud-certificates', {
    onRequest: guards.raw(handlers.cloudCertificates, admin),
    schema: { summary: 'Importer trois fichiers PEM Bambu (chiffrés au repos, aucune commande machine)', tags: ['cloud'], security: session,
      response: { 200: json('Métadonnées uniquement'), ...errorResponses(400, 401, 403, 415, 421, 429, 503) } },
  }, none);

  // Comptes cloud : administrateur, puis origine, type de contenu, limite par compte et corps (gestionnaire).
  const cloudActions = 'login|verify|devices|disconnect|delete|logs|logs-download|telemetry-start|telemetry-stop|import';
  app.post('/api/cloud-accounts', {
    onRequest: guards.raw(handlers.cloudAction, admin),
    schema: { summary: 'Ajouter un compte constructeur', tags: ['cloud'], security: session, response: { 200: json('Compte créé, sans secret.'), ...errorResponses(400, 401, 403, 409, 415, 421, 429, 500) } },
  }, none);
  app.post(`/api/cloud-accounts/${id}/:action(${cloudActions})`, {
    onRequest: guards.raw(handlers.cloudAction, admin),
    schema: { summary: 'Action sur un compte : connexion, vérification, appareils, import, télémétrie, déconnexion, suppression', tags: ['cloud'], security: session,
      params: Type.Object({ id: Type.String(), action: Type.String() }), response: { 200: json('Résultat de l’action, sans jeton.'), ...errorResponses(400, 401, 403, 404, 405, 409, 415, 421, 429, 500, 502) } },
  }, none);

  // Caméras : session ; flux MJPEG partagé ou image JPEG (aperçu).
  for (const [path, summary] of [
    [`/api/machines/${id}/camera`, 'Flux caméra MJPEG'],
    [`/api/machines/${id}/camera/:view(side|far|near)`, 'Flux caméra MJPEG d’une vue xTool'],
    [`/api/machines/${id}/camera/preview`, 'Aperçu caméra'],
    [`/api/machines/${id}/camera/preview/:view(side|far|near)`, 'Aperçu caméra d’une vue xTool'],
  ] as const) {
    app.get(path, {
      onRequest: guards.raw(handlers.camera, signedIn),
      schema: { summary, tags: ['caméras'], security: session, response: { 200: { description: 'Flux `multipart/x-mixed-replace` ou image `image/jpeg`.' }, ...errorResponses(401, 404, 421, 429, 502, 503, 504) } },
    }, none);
  }

  // Commandes et contrôles : confirmations, état requis, verrou par machine, aucun rejeu (MIG-03.2.1).
  app.post(`/api/machines/${id}/command`, {
    onRequest: guards.raw(handlers.command, admin),
    schema: { summary: 'Pause, reprise, arrêt ou lancement préparé (confirmation pour arrêt et lancement)', tags: ['commandes'], security: session, params: Params,
      response: { 200: json('État observé après la commande.'), ...errorResponses(400, 401, 403, 404, 409, 415, 421, 502, 504) } },
  }, none);
  for (const method of ['GET', 'POST'] as const) {
    app.route({ method, url: `/api/machines/${id}/controls`,
      onRequest: guards.raw(handlers.controls, signedIn),
      schema: { summary: method === 'GET' ? 'Contrôles manuels disponibles et état' : 'Exécuter un contrôle manuel (chauffe, ventilateur, lumière, déplacement)', tags: ['commandes'], security: session, params: Params,
        response: { 200: json(method === 'GET' ? 'Contrôles relus côté serveur.' : 'Issue : executed, accepted ou confirmed.'), ...errorResponses(400, 401, 403, 404, 409, 415, 421, 429, 502, 504) } },
      handler: none });
  }
  app.post(`/api/machines/${id}/gcode`, {
    onRequest: guards.raw(handlers.terminal, admin),
    schema: { summary: 'Terminal G-code (confirmation pendant une fabrication)', tags: ['commandes'], security: session, params: Params,
      response: { 200: json('Issue : executed, accepted ou rejected.'), ...errorResponses(400, 401, 403, 404, 409, 415, 421, 429, 504) } },
  }, none);

  // Fichiers : session ; écritures réservées aux administrateurs après identification de la machine.
  const files: [ 'GET' | 'POST', string, string ][] = [
    ['GET', 'files', 'Fichiers de la machine (300 au plus)'],
    ['GET', 'file', 'Lire ou télécharger un fichier (`path`, `download=1`)'],
    ['POST', 'files', 'Envoyer un fichier (`name`, corps `application/octet-stream`), sans lancement'],
    ['POST', 'transfer', 'Copier un fichier vers une autre machine compatible'],
    ['POST', 'print', 'Lancer un fichier présent (confirmation requise)'],
  ];
  for (const [method, route, summary] of files) {
    app.route({ method, url: `/api/machines/${id}/${route}`, config: { query: true },
      onRequest: guards.raw(handlers.files, signedIn),
      schema: { summary, tags: ['fichiers'], security: session, params: Params,
        response: { [method === 'GET' ? 200 : route === 'print' ? 200 : 201]: { description: 'Réponse JSON, ou contenu du fichier pour `file`.' }, ...errorResponses(400, 401, 403, 404, 409, 411, 413, 415, 421, 502, 504) } },
      handler: none });
  }
};
