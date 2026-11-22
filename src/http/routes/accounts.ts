import Type from 'typebox';
import { JsonBody, type RouteModule } from '../app.ts';
import { HttpError, errorResponses } from '../errors.ts';

export const Credentials = Type.Object({
  username: Type.Optional(Type.String({ maxLength: 40 })),
  password: Type.Optional(Type.String({ maxLength: 128 })),
}, { additionalProperties: true });
export const SignedIn = Type.Object({
  authenticated: Type.Literal(true),
  username: Type.String(),
  role: Type.Union([Type.Literal('admin'), Type.Literal('observer')]),
}, { additionalProperties: false });
export const SignedOut = Type.Object({ authenticated: Type.Literal(false) }, { additionalProperties: false });
export const Observer = Type.Object({ username: Type.String() }, { additionalProperties: false });

type Body = Record<string, unknown>;
interface Granted { body: Type.Static<typeof SignedIn>; cookie: string }

export interface AccountDependencies {
  installed(): boolean;
  /** Création de l'administrateur avec le jeton d'activation à usage unique. */
  setup(data: Body): Promise<Granted>;
  login(data: Body, activeSession: string | null): Promise<Granted>;
  logout(activeSession: string | null): { body: Type.Static<typeof SignedOut>; cookie: string };
  addObserver(data: Body): Promise<Type.Static<typeof Observer>>;
}

/**
 * Comptes et sessions. L'ordre des contrôles reproduit le POC et précède la lecture du corps :
 * origine, type de contenu, droits ou installation, limite de tentatives, puis corps JSON.
 */
export const accountRoutes = (dependencies: AccountDependencies): RouteModule => (app, guards) => {
  const body = { body: JsonBody };
  app.post<{ Body: Body }>('/api/setup', {
    onRequest: async request => {
      guards.json(request);
      if (dependencies.installed()) throw new HttpError(409, 'installed');
      guards.rate('/api/setup');
    },
    schema: { summary: 'Créer l’administrateur avec le jeton d’activation', tags: ['session'], ...body,
      response: { 200: SignedIn, ...errorResponses(400, 403, 409, 410, 415, 421, 429) } },
  }, async (request, reply) => {
    const { body: result, cookie } = await dependencies.setup(request.body);
    return reply.header('Set-Cookie', cookie).send(result);
  });
  app.post<{ Body: Body }>('/api/login', {
    onRequest: async request => { guards.json(request); guards.rate('/api/login'); },
    schema: { summary: 'Ouvrir une session locale', tags: ['session'], ...body,
      response: { 200: SignedIn, ...errorResponses(400, 401, 403, 415, 421, 429) } },
  }, async (request, reply) => {
    const { body: result, cookie } = await dependencies.login(request.body, guards.current(request)?.session ?? null);
    return reply.header('Set-Cookie', cookie).send(result);
  });
  app.post('/api/logout', {
    onRequest: async request => { guards.json(request); },
    schema: { summary: 'Fermer la session courante', tags: ['session'],
      response: { 200: SignedOut, ...errorResponses(403, 415, 421) } },
  }, async (request, reply) => {
    const { body: result, cookie } = dependencies.logout(guards.current(request)?.session ?? null);
    return reply.header('Set-Cookie', cookie).send(result);
  });
  app.post<{ Body: Body }>('/api/observers', {
    onRequest: async request => { guards.json(request); guards.admin(request); },
    schema: { summary: 'Créer un compte observateur', tags: ['administration'], security: [{ session: [] }], ...body,
      response: { 201: Observer, ...errorResponses(400, 401, 403, 409, 415, 421) } },
  }, async (request, reply) => reply.code(201).send(await dependencies.addObserver(request.body)));
};
