import Type from 'typebox';
import type { RouteModule } from '../app.ts';
import { errorResponses } from '../errors.ts';

const Commit = Type.Union([Type.String({ pattern: '^[0-9a-f]{40}$' }), Type.Null()]);
export const VersionStatus = Type.Object({
  current: Commit, latest: Commit, updateAvailable: Type.Boolean(),
  checkedAt: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export interface VersionDependencies { status(): Promise<Type.Static<typeof VersionStatus>> }

/** Version installée et dernière version de `main` (cache serveur) ; toute session. */
export const versionRoutes = (dependencies: VersionDependencies): RouteModule => (app, guards) => {
  app.get('/api/version', {
    schema: { summary: 'Version installée et mise à jour disponible', tags: ['administration'], security: [{ session: [] }],
      response: { 200: VersionStatus, ...errorResponses(401, 421) } },
  }, async request => {
    guards.signedIn(request);
    return dependencies.status();
  });
};
