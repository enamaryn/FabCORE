import Type from 'typebox';
import type { RouteModule, Viewer } from '../app.ts';
import { errorResponses } from '../errors.ts';

export const FleetCapabilities = Type.Object({
  camera: Type.Optional(Type.Boolean()), controls: Type.Optional(Type.Boolean()),
  commands: Type.Optional(Type.Boolean()), commandActions: Type.Optional(Type.Array(Type.String())),
  files: Type.Optional(Type.Boolean()), terminal: Type.Optional(Type.Boolean()),
  filaments: Type.Optional(Type.Union([Type.String(), Type.Null()])), temperatures: Type.Optional(Type.Boolean()),
  printJob: Type.Optional(Type.Boolean()), fileFamily: Type.Optional(Type.String()), externalFilament: Type.Optional(Type.Boolean()),
}, { additionalProperties: true, description: 'Capacités publiques configurées du connecteur, sans identifiants de connexion ; le serveur revalide chaque action.' });

/** Champs stables d'une machine du parc ; la télémétrie et les capacités propres au connecteur suivent telles quelles. */
export const FleetMachine = Type.Object({
  id: Type.String(),
  name: Type.String(),
  kind: Type.String({ description: 'Identifiant du connecteur.' }),
  status: Type.Union(['connecting', 'ready', 'printing', 'paused', 'done', 'offline', 'error'].map(value => Type.Literal(value))),
  capabilities: Type.Optional(FleetCapabilities),
  cameraOpen: Type.Boolean({ description: 'Un flux caméra de cette session est ouvert pour la machine.' }),
}, { additionalProperties: true });

export const Fleet = Type.Object({ machines: Type.Array(FleetMachine) }, { additionalProperties: false });

export interface FleetDependencies {
  /** Parc lu pour une session ; une machine en erreur reste listée hors ligne, une machine supprimée pendant la lecture est omise. */
  list(viewer: Viewer): Promise<Record<string, unknown>[]>;
}

export const fleetRoutes = (dependencies: FleetDependencies): RouteModule => (app, guards) => {
  app.get('/api/machines', {
    schema: {
      summary: 'Parc et dernière télémétrie de chaque machine',
      tags: ['parc'],
      security: [{ session: [] }],
      response: { 200: Fleet, ...errorResponses(401, 421) },
    },
  }, async request => ({ machines: await dependencies.list(guards.signedIn(request)) }));
};
