import Type from 'typebox';
import type { RouteModule } from '../app.ts';
import { HttpError, errorResponses } from '../errors.ts';

const id = ':id([a-f0-9-]{36})';
const Line = Type.Object({}, { additionalProperties: true, description: 'Entrée de journal JSON, secrets déjà masqués à l’écriture.' });
const Download = { description: 'Journal brut, une entrée JSON par ligne.', content: { 'text/plain': { schema: Type.String() } } };
const Params = Type.Object({ id: Type.String() });

export const MachineLog = Type.Object({
  machine: Type.Object({ id: Type.String(), name: Type.String(), kind: Type.Optional(Type.String()), mode: Type.String() }, { additionalProperties: false }),
  lines: Type.Array(Line),
}, { additionalProperties: false });
export const CloudLog = Type.Object({ lines: Type.Array(Line) }, { additionalProperties: false });
export const CloudAccounts = Type.Object({
  providers: Type.Array(Type.Object({}, { additionalProperties: true })),
  accounts: Type.Array(Type.Object({}, { additionalProperties: true, description: 'Compte constructeur, sans jeton ni mot de passe.' })),
}, { additionalProperties: false });

export interface LogDependencies {
  machine(id: string): { id: string; name: string; kind?: string; mode?: string } | null;
  /** Contenu brut du journal ; une erreur de lecture devient 503 `logs-unavailable`. */
  machineLog(id: string): string;
  cloudAccounts(): Type.Static<typeof CloudAccounts>;
  cloudLog(id: string): string;
  /** Traduit une erreur du module cloud en réponse HTTP (refus connu ou `cloud-storage`). */
  cloudFailure(error: unknown): HttpError;
}

const parse = (content: string, limit: number) => content.trim().split('\n').filter(Boolean).slice(-limit).map(line => JSON.parse(line) as Record<string, unknown>);

/** Journaux par machine et comptes cloud, réservés aux administrateurs. */
export const logRoutes = (dependencies: LogDependencies): RouteModule => (app, guards) => {
  const machineLog = (request: Parameters<typeof guards.admin>[0], id: string) => {
    guards.admin(request);
    const machine = dependencies.machine(id);
    if (!machine) throw new HttpError(404, 'missing');
    try { return { machine, content: dependencies.machineLog(machine.id) }; }
    catch { throw new HttpError(503, 'logs-unavailable'); }
  };
  app.get<{ Params: { id: string } }>(`/api/machines/${id}/logs`, {
    schema: { summary: 'Journal récent d’une machine (500 entrées)', tags: ['journaux'], security: [{ session: [] }], params: Params,
      response: { 200: MachineLog, ...errorResponses(401, 403, 404, 421, 503) } },
  }, async request => {
    const { machine, content } = machineLog(request, request.params.id);
    try {
      return { machine: { id: machine.id, name: machine.name, kind: machine.kind, mode: machine.mode ?? 'lan' }, lines: parse(content, 500) };
    } catch { throw new HttpError(503, 'logs-unavailable'); }
  });
  app.get<{ Params: { id: string } }>(`/api/machines/${id}/logs-download`, {
    schema: { summary: 'Téléchargement du journal complet d’une machine', tags: ['journaux'], security: [{ session: [] }], params: Params,
      response: { 200: Download, ...errorResponses(401, 403, 404, 421, 503) } },
  }, async (request, reply) => {
    const { machine, content } = machineLog(request, request.params.id);
    return reply.type('text/plain; charset=utf-8').header('Content-Disposition', `attachment; filename="fabcore-machine-${machine.id}.log"`).send(content);
  });

  const cloud = <T>(run: () => T): T => {
    try { return run(); } catch (error) { throw dependencies.cloudFailure(error); }
  };
  app.get('/api/cloud-accounts', {
    schema: { summary: 'Comptes constructeur et fournisseurs disponibles', tags: ['cloud'], security: [{ session: [] }],
      response: { 200: CloudAccounts, ...errorResponses(401, 403, 421, 500) } },
  }, async request => { guards.admin(request); return cloud(() => dependencies.cloudAccounts()); });
  app.get<{ Params: { id: string } }>(`/api/cloud-accounts/${id}/logs`, {
    schema: { summary: 'Journal récent d’un compte cloud (300 entrées)', tags: ['cloud'], security: [{ session: [] }], params: Params,
      response: { 200: CloudLog, ...errorResponses(401, 403, 404, 421, 500) } },
  }, async request => { guards.admin(request); return cloud(() => ({ lines: parse(dependencies.cloudLog(request.params.id), 300) })); });
  app.get<{ Params: { id: string } }>(`/api/cloud-accounts/${id}/logs-download`, {
    schema: { summary: 'Téléchargement du journal complet d’un compte cloud', tags: ['cloud'], security: [{ session: [] }], params: Params,
      response: { 200: Download, ...errorResponses(401, 403, 404, 421, 500) } },
  }, async (request, reply) => {
    guards.admin(request);
    const content = cloud(() => dependencies.cloudLog(request.params.id));
    return reply.type('text/plain; charset=utf-8').header('Content-Disposition', `attachment; filename="fabcore-cloud-${request.params.id}.log"`).send(content);
  });
};
