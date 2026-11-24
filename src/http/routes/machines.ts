import type { FastifyReply, FastifyRequest } from 'fastify';
import Type from 'typebox';
import { JsonBody, type RouteModule, type Viewer } from '../app.ts';
import { HttpError } from '../errors.ts';
import { errorResponses } from '../errors.ts';

type Body = Record<string, unknown>;
export type MachineAction = 'add' | 'test' | 'edit' | 'pair' | 'delete';
type SpoolResult = { manualSpool: Record<string, unknown> | null };

export interface WriteContext {
  viewer: Viewer;
  /** Annulé quand le client ferme la requête : la sonde en cours s'arrête. */
  signal: AbortSignal;
  /** La session est-elle toujours valide (vérifié après un appairage long) ? */
  stillSignedIn(): boolean;
}

export interface MachineDependencies {
  /** `null` : requête annulée par le client, aucune réponse n'est due. */
  write(action: MachineAction, data: Body, context: WriteContext): Promise<{ status: number; body: Record<string, unknown> } | null>;
  camera?(id: string, data: Body): Promise<{ camera: { mode: string; host: string } }>;
  spool(id: string, data: Body): SpoolResult | Promise<SpoolResult>;
  networks(): { networks: string[] };
  discover(data: Body, signal: AbortSignal): Promise<{ devices: Record<string, unknown>[] } | null>;
}

const Identifier = Type.Object({ id: Type.String() }, { additionalProperties: false });
const ProbeResult = Type.Object({ ok: Type.Boolean(), issue: Type.Union([Type.String(), Type.Null()]), serial: Type.Optional(Type.String()) }, { additionalProperties: false });
const Spool = Type.Object({ manualSpool: Type.Union([Type.Object({ material: Type.String(), name: Type.String(), color: Type.Union([Type.String(), Type.Null()]) }, { additionalProperties: false }), Type.Null()]) }, { additionalProperties: false });
const Networks = Type.Object({ networks: Type.Array(Type.String()) }, { additionalProperties: false });
const Devices = Type.Object({ devices: Type.Array(Type.Object({}, { additionalProperties: true })) }, { additionalProperties: false });

/** Annulation liée à la fermeture de la réponse, comme `res.once('close')` dans le POC. */
function cancellation(reply: FastifyReply) {
  const abort = new AbortController();
  const stop = () => abort.abort();
  reply.raw.once('close', stop);
  return { signal: abort.signal, release: () => reply.raw.off('close', stop) };
}
/** Client parti : ne rien écrire sur une réponse fermée. */
const abandoned = (reply: FastifyReply) => reply.hijack();

/**
 * Administration du parc. Ordre des contrôles identique au POC, avant lecture du corps :
 * écritures machines → origine, type de contenu, administrateur ;
 * bobine et découverte → administrateur, puis origine et type de contenu.
 */
export const machineRoutes = (dependencies: MachineDependencies): RouteModule => (app, guards) => {
  const originFirst = { onRequest: async (request: FastifyRequest) => { guards.json(request); guards.admin(request); } };
  const rightsFirst = { onRequest: async (request: FastifyRequest) => { guards.admin(request); guards.json(request); } };
  const writes: [string, MachineAction, string, Record<number, unknown>][] = [
    ['/api/machines', 'add', 'Ajouter une machine (ou la modifier si `id` est fourni)', { 200: Identifier, 201: Identifier }],
    ['/api/machines/edit', 'edit', 'Modifier une machine existante', { 200: Identifier }],
    ['/api/machines/test', 'test', 'Tester une connexion sans enregistrer', { 200: ProbeResult }],
    ['/api/machines/pair', 'pair', 'Appairer une xTool M2 puis l’enregistrer', { 200: Identifier, 201: Identifier }],
    ['/api/machines/delete', 'delete', 'Supprimer une machine et fermer ses sessions', { 200: Identifier }],
  ];
  for (const [path, action, summary, responses] of writes) {
    app.post<{ Body: Body }>(path, {
      ...originFirst,
      schema: { summary, tags: ['parc'], security: [{ session: [] }], body: JsonBody,
        response: { ...responses, ...errorResponses(400, 401, 403, 404, 409, 415, 421, 422, 429) } },
    }, async (request, reply) => {
      const viewer = guards.admin(request);
      const { signal, release } = cancellation(reply);
      try {
        const result = await dependencies.write(action, request.body, { viewer, signal, stillSignedIn: () => guards.current(request) !== null });
        if (!result) return abandoned(reply);
        return reply.code(result.status).send(result.body);
      } finally { release(); }
    });
  }
  app.post<{ Body: Body; Params: { id: string } }>('/api/machines/:id([a-f0-9-]{36})/spool', {
    ...rightsFirst,
    schema: { summary: 'Renseigner ou effacer la bobine manuelle', tags: ['parc'], security: [{ session: [] }], body: JsonBody,
      params: Type.Object({ id: Type.String() }), response: { 200: Spool, ...errorResponses(400, 401, 403, 404, 415, 421) } },
  }, async request => dependencies.spool(request.params.id, request.body));
  app.post<{ Body: Body; Params: { id: string } }>('/api/machines/:id([a-f0-9-]{36})/camera-settings', {
    ...rightsFirst,
    schema: { summary: 'Configurer la caméra hybride Bambu Cloud (expérimentale), sans commande de fabrication', tags: ['caméras'], security: [{ session: [] }], body: JsonBody,
      response: { 200: Type.Object({ camera: Type.Object({ mode: Type.String(), host: Type.String() }) }), ...errorResponses(400, 401, 403, 404, 415, 421, 503) } },
  }, async request => {
    if (!dependencies.camera) throw new HttpError(404, 'camera-unsupported');
    return dependencies.camera(request.params.id, request.body);
  });
  app.get('/api/discovery', {
    schema: { summary: 'Réseaux locaux proposés à la découverte', tags: ['parc'], security: [{ session: [] }],
      response: { 200: Networks, ...errorResponses(401, 403, 421) } },
  }, async request => { guards.admin(request); return dependencies.networks(); });
  app.post<{ Body: Body }>('/api/discovery', {
    ...rightsFirst,
    schema: { summary: 'Rechercher les machines d’un réseau local', tags: ['parc'], security: [{ session: [] }], body: JsonBody,
      response: { 200: Devices, ...errorResponses(400, 401, 403, 415, 421, 429) } },
  }, async (request, reply) => {
    const { signal, release } = cancellation(reply);
    try {
      const result = await dependencies.discover(request.body, signal);
      return result ? result : abandoned(reply);
    } finally { release(); }
  });
};
