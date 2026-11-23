// Socle HTTP Fastify (ADR 0002, MIG-03) : unique routeur du serveur. Les gestionnaires encore écrits
// dans le POC sont branchés en mode brut (`guards.raw`) derrière les contrôles centralisés.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import swagger from '@fastify/swagger';
import Type from 'typebox';
import { ErrorBody, HttpError, errorResponses } from './errors.ts';

export type Role = 'admin' | 'observer';
export interface Viewer { session: string; username: string; role: Role }

export interface HttpDependencies {
  /** Hôte public attendu ; toute autre valeur répond 421, comme le POC. */
  allowedHost: string;
  /** Origine publique exacte exigée sur les écritures (`Origin`), sinon 403 `origin`. */
  origin: string;
  /** Limiteur de tentatives partagé avec le POC (même compteur par clé) ; faux = 429 `rate`. */
  limit(key: string): boolean;
  /** Session de la requête, résolue par le POC pendant la migration. */
  viewer(request: IncomingMessage): Viewer | null;
  /** Appelé pour toute erreur interne (500), comme `request-failed` dans le diagnostic du POC. */
  onFailure?(): void;
  /** Requête sans route : réponse de repli (404 ou 405 historiques), avant toute lecture du corps. */
  fallback?: RawHandler;
}

/** Gestionnaire écrivant directement la réponse Node (flux, fichiers, caméras), corps de requête non lu. */
export type RawHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void> | void;

declare module 'fastify' {
  interface FastifyContextConfig {
    /** La route accepte une chaîne de requête ; sinon une requête `?…` répond 404 `missing`, comme le POC. */
    query?: boolean;
  }
}

export type RouteModule = (app: FastifyInstance, guards: Guards) => void;

export interface Guards {
  /** Session éventuelle, sans exigence. */
  current(request: FastifyRequest): Viewer | null;
  /** Exige une session valide : 401 `sign-in` sinon. */
  signedIn(request: FastifyRequest): Viewer;
  /** Exige un administrateur : 401 `sign-in` sans session, 403 `forbidden` pour un observateur. */
  admin(request: FastifyRequest): Viewer;
  /** Écriture JSON : origine exacte (403 `origin`) puis `Content-Type: application/json` (415 `invalid`). Vérifié avant la lecture du corps. */
  json(request: FastifyRequest): void;
  /** Limite de tentatives par clé : 429 `rate`. */
  rate(key: string): void;
  /**
   * Hook `onRequest` qui applique `guard` puis confie la requête à `handler` sans lire le corps :
   * en-têtes de sécurité posés, erreur interne 500 `internal` signalée, flux fermé si déjà commencé.
   */
  raw(handler: RawHandler, guard?: (request: FastifyRequest) => unknown): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

/** Corps JSON attendu par une écriture : un objet, jamais un tableau ni `null` (400 `invalid`). */
export const JsonBody = Type.Object({}, { additionalProperties: true });

const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

export interface HttpApp {
  app: FastifyInstance;
  ready: Promise<void>;
  dispatch(request: IncomingMessage, response: ServerResponse): void;
  close(): Promise<void>;
}

export function createHttpApp(dependencies: HttpDependencies, routes: RouteModule[]): HttpApp {
  let handler: ((request: IncomingMessage, response: ServerResponse) => void) | undefined;
  const app = fastify({
    logger: false,
    // Le serveur public reste créé par le POC (délais, écoute) ; Fastify reçoit chaque requête par `dispatch`.
    serverFactory: routing => { handler = routing; return createServer(); },
    exposeHeadRoutes: false,
    return503OnClosing: false,
  });
  void app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'FabCore API', version: '0.1.0', description: 'API REST de FabCore (MIG-03). Erreurs : `{ error: code }` stable, traduit par l’interface.' },
      components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'fabcore_session' } } },
    },
    refResolver: { buildLocalReference: (json, _baseUri, _fragment, index) => typeof json.$id === 'string' ? json.$id : `def-${index}` },
  });
  app.addSchema(ErrorBody);

  const writeFailure = (response: ServerResponse) => {
    dependencies.onFailure?.();
    if (response.headersSent) { response.end(); return; }
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'internal' }));
  };
  const runRaw = async (handler: RawHandler, request: FastifyRequest, reply: FastifyReply) => {
    reply.hijack();
    for (const [name, value] of Object.entries(securityHeaders)) reply.raw.setHeader(name, value);
    try { await handler(request.raw, reply.raw); } catch { writeFailure(reply.raw); }
  };
  app.addHook('onRequest', async (request, reply) => {
    void reply.headers(securityHeaders);
    if (request.headers.host !== dependencies.allowedHost) throw new HttpError(421, 'host');
    // Sans route : repli avant lecture du corps (un corps invalide ne change pas le 404/405 historique).
    if (request.is404) {
      if (dependencies.fallback) await runRaw(dependencies.fallback, request, reply);
      else throw new HttpError(404, 'missing');
      return;
    }
    if (request.url.includes('?') && !request.routeOptions.config.query) throw new HttpError(404, 'missing');
  });
  // Corps JSON comme le POC : 4 Kio au plus ; corps vide toléré (déconnexion), validé ensuite par le schéma de la route.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 4096 }, (_request, body, done) => {
    if (body === '') { done(null, undefined); return; }
    try { done(null, JSON.parse(body as string) as unknown); } catch { done(new HttpError(400, 'invalid'), undefined); }
  });
  app.setErrorHandler((failure: Error & { statusCode?: number; validation?: unknown; code?: string }, _request, reply) => {
    if (failure instanceof HttpError) return reply.code(failure.statusCode).send({ error: failure.message });
    if (failure.validation || failure.code?.startsWith('FST_ERR_CTP_')) return reply.code(400).send({ error: 'invalid' });
    dependencies.onFailure?.();
    return reply.code(500).send({ error: 'internal' });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'missing' }));

  const guards: Guards = {
    current: request => dependencies.viewer(request.raw),
    signedIn(request) {
      const viewer = dependencies.viewer(request.raw);
      if (!viewer) throw new HttpError(401, 'sign-in');
      return viewer;
    },
    admin(request) {
      const viewer = guards.signedIn(request);
      if (viewer.role !== 'admin') throw new HttpError(403, 'forbidden');
      return viewer;
    },
    json(request) {
      if (request.headers.origin !== dependencies.origin) throw new HttpError(403, 'origin');
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, 'invalid');
    },
    rate(key) {
      if (!dependencies.limit(key)) throw new HttpError(429, 'rate');
    },
    raw: (handler, guard) => async (request, reply) => {
      guard?.(request);
      await runRaw(handler, request, reply);
    },
  };

  // Routes chargées après le plugin OpenAPI, pour qu'il les enregistre toutes.
  void app.register(async scope => {
    scope.get('/api/openapi.json', {
      schema: { hide: true, response: errorResponses(401, 421) },
    }, async (request: FastifyRequest, reply: FastifyReply) => {
      guards.signedIn(request);
      return reply.send(app.swagger());
    });
    for (const register of routes) register(scope, guards);
  });

  const ready: Promise<void> = Promise.resolve(app.ready()).then(() => undefined);
  return {
    app,
    ready,
    dispatch(request, response) {
      ready.then(() => handler!(request, response), () => {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'internal' }));
      });
    },
    close: () => app.close(),
  };
}
