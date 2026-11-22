import type { IncomingMessage } from 'node:http';
import Type from 'typebox';
import type { RouteModule, Viewer } from '../app.ts';
import { errorResponses } from '../errors.ts';

export const SessionState = Type.Object({
  installed: Type.Boolean({ description: 'Un administrateur a été créé.' }),
  authenticated: Type.Boolean(),
  username: Type.Union([Type.String(), Type.Null()]),
  role: Type.Optional(Type.Union([Type.Literal('admin'), Type.Literal('observer')])),
  oidcEnabled: Type.Optional(Type.Literal(true)),
}, { additionalProperties: false });
export type SessionState = Type.Static<typeof SessionState>;

export interface SessionDependencies {
  installed(): boolean;
  /** OIDC configuré, servi en HTTPS et installation terminée. */
  oidcEnabled(): boolean;
  viewer(request: IncomingMessage): Viewer | null;
}

/** État de session public : lu par l'interface avant connexion, sans exiger de session. */
export const sessionRoutes = (dependencies: SessionDependencies): RouteModule => app => {
  app.get('/api/session', {
    schema: {
      summary: 'État de l’installation et de la session courante',
      tags: ['session'],
      response: { 200: SessionState, ...errorResponses(421) },
    },
  }, async (request): Promise<SessionState> => {
    const viewer = dependencies.viewer(request.raw);
    return {
      installed: dependencies.installed(), authenticated: Boolean(viewer),
      username: viewer?.username ?? null, ...(viewer ? { role: viewer.role } : {}),
      ...(dependencies.oidcEnabled() ? { oidcEnabled: true as const } : {}),
    };
  });
};
