// Socle HTTP Fastify (ADR 0002, MIG-03). Il ne sert que les routes migrées ; tout le reste
// continue d'être traité par le routeur du POC, sans changement de contrat (étrangleur).
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
  /** Vrai si la requête correspond exactement à une route migrée (méthode et chemin, requête comprise). */
  handles(request: IncomingMessage): boolean;
  dispatch(request: IncomingMessage, response: ServerResponse): void;
  close(): Promise<void>;
}

/**
 * Expression du chemin complet d'une route Fastify. Un paramètre `:id(regex)` reprend sa contrainte
 * (Fastify l'ancre au segment) ; la requête n'est jamais acceptée, comme dans le routeur du POC.
 */
export function routePattern(url: string): RegExp {
  let source = '';
  for (let index = 0; index < url.length;) {
    const parameter = /^:[A-Za-z_][A-Za-z0-9_]*(?:\(((?:[^()\\]|\\.)+)\))?/.exec(url.slice(index));
    if (parameter) {
      source += parameter[1] ? `(?:${parameter[1].replace(/^\^/, '').replace(/\$$/, '')})` : '[^/?#]+';
      index += parameter[0].length;
    } else {
      source += url[index]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      index += 1;
    }
  }
  return new RegExp(`^${source}$`);
}

export function createHttpApp(dependencies: HttpDependencies, routes: RouteModule[]): HttpApp {
  let handler: ((request: IncomingMessage, response: ServerResponse) => void) | undefined;
  const app = fastify({
    logger: false,
    // Le serveur public reste celui du POC ; Fastify ne fait que router les requêtes déléguées.
    serverFactory: routing => { handler = routing; return createServer(); },
    exposeHeadRoutes: false,
    return503OnClosing: false,
  });
  const migrated: { method: string; pattern: RegExp }[] = [];
  app.addHook('onRoute', route => {
    for (const method of [route.method].flat()) migrated.push({ method, pattern: routePattern(route.url) });
  });

  void app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'FabCore API', version: '0.1.0', description: 'Routes REST migrées vers le socle typé (MIG-03). Les autres routes restent servies par le POC jusqu’à leur migration.' },
      components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'fabcore_session' } } },
    },
    refResolver: { buildLocalReference: (json, _baseUri, _fragment, index) => typeof json.$id === 'string' ? json.$id : `def-${index}` },
  });
  app.addSchema(ErrorBody);

  app.addHook('onRequest', async (request, reply) => {
    void reply.headers(securityHeaders);
    if (request.headers.host !== dependencies.allowedHost) throw new HttpError(421, 'host');
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
    handles: request => migrated.some(({ method, pattern }) => method === request.method && pattern.test(request.url ?? '')),
    dispatch(request, response) {
      ready.then(() => handler!(request, response), () => {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'internal' }));
      });
    },
    close: () => app.close(),
  };
}
