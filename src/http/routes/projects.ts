import { ProjectBoardSchema, ProjectRecord, WorkRecord } from '../../domain/projects.ts';
import Type from 'typebox';
import type { FastifyRequest } from 'fastify';
import { JsonBody, type RouteModule } from '../app.ts';
import { errorResponses, HttpError } from '../errors.ts';
import type { createProjectService } from '../../application/projects.ts';
export type ProjectDependencies = ReturnType<typeof createProjectService>;
const response = Type.Object({}, { additionalProperties: true });
const security = [{ session: [] }];

export const projectRoutes = (service: ProjectDependencies): RouteModule => (app, guards) => {
  // Project briefs/links can exceed the legacy 4 KiB body. Override only this encapsulated plugin.
  void app.register(async scope => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 64 * 1024 }, (_request, body, done) => {
      try { done(null, JSON.parse(body as string) as unknown); } catch { done(new HttpError(400, 'project-invalid'), undefined); }
    });
    const write = async (request: FastifyRequest) => { const viewer = guards.admin(request); guards.json(request); guards.rate('projects:' + viewer.session); };
    const schema = (summary: string, result = response) => ({ summary, tags: ['projets'], security, body: JsonBody,
      response: { 200: result, ...errorResponses(400, 401, 403, 404, 409, 415, 421, 429, 503) } });
    scope.get('/api/projects', { onRequest: async request => { guards.signedIn(request); }, schema: { summary: 'Kanban des projets créatifs et travaux à produire', tags: ['projets'], security,
      response: { 200: ProjectBoardSchema, ...errorResponses(401, 403, 421, 503) } } }, () => service.list());
    scope.post<{ Body: Record<string, unknown>; Params: { id: string } }>('/api/production/work/:id([a-f0-9-]{36})/execution', { onRequest: write, schema: schema('Associer explicitement une fabrication ou déclarer son suivi, sans ordre machine', WorkRecord) },
      request => service.beginExecution(request.params.id, request.body, guards.admin(request).username));
    scope.post<{ Body: Record<string, unknown>; Params: { id: string; executionId: string } }>('/api/production/work/:id([a-f0-9-]{36})/execution/:executionId([a-f0-9-]{36})/finish', { onRequest: write, schema: schema('Confirmer le résultat et les heures réelles d’une fabrication', WorkRecord) },
      request => service.finishExecution(request.params.id, request.params.executionId, request.body, guards.admin(request).username));
    scope.post<{ Body: Record<string, unknown>; Params: { id: string } }>('/api/production/work/:id([a-f0-9-]{36})/replan-preview', { onRequest: write, schema: schema('Proposer le recalage des travaux suivants après dépassement confirmé') },
      request => service.previewReplan(request.params.id, request.body));
    scope.post<{ Body: Record<string, unknown> }>('/api/production/replan-apply', { onRequest: write, schema: schema('Appliquer une proposition de recalage confirmée et non périmée', ProjectBoardSchema) },
      request => service.applyReplan(request.body, guards.admin(request).username));
    scope.get('/api/production', { onRequest: async request => { guards.signedIn(request); }, schema: { summary: 'Planning autonome : travaux directs et liés aux projets', tags: ['production'], security,
      response: { 200: ProjectBoardSchema, ...errorResponses(401, 403, 421, 503) } } }, () => service.list());
    scope.post<{ Body: Record<string, unknown> }>('/api/production/work', { onRequest: write, schema: schema('Créer un travail autonome ou lié à un projet, sans ordre machine', WorkRecord) },
      request => service.saveWork(null, null, request.body, guards.admin(request).username));
    scope.post<{ Body: Record<string, unknown>; Params: { id: string } }>('/api/production/work/:id([a-f0-9-]{36})', { onRequest: write, schema: schema('Planifier ou modifier un travail avec contrôle de révision, sans lancement', WorkRecord) },
      request => service.saveWork(null, request.params.id, request.body, guards.admin(request).username));
    scope.post<{ Body: Record<string, unknown> }>('/api/projects', { onRequest: write, schema: schema('Créer une idée, création personnelle ou demande client', ProjectRecord) },
      request => service.create(request.body, guards.admin(request).username));
    scope.post<{ Body: Record<string, unknown>; Params: { id: string } }>('/api/projects/:id([a-f0-9-]{36})', { onRequest: write, schema: schema('Modifier, déplacer ou archiver un projet avec contrôle de révision', ProjectRecord) },
      request => service.update(request.params.id, request.body, guards.admin(request).username));
    scope.post<{ Body: Record<string, unknown>; Params: { id: string } }>('/api/projects/:id([a-f0-9-]{36})/work', { onRequest: write, schema: schema('Préparer un travail à produire, sans ordre machine', WorkRecord) },
      request => service.saveWork(request.params.id, null, request.body, guards.admin(request).username));
    scope.post<{ Body: Record<string, unknown>; Params: { id: string; workId: string } }>('/api/projects/:id([a-f0-9-]{36})/work/:workId([a-f0-9-]{36})', { onRequest: write, schema: schema('Modifier un travail de projet, sans planification ni lancement automatique', WorkRecord) },
      request => service.saveWork(request.params.id, request.params.workId, request.body, guards.admin(request).username));
  });
};
