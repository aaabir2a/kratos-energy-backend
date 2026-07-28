import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { ok, created, paginated, noContent } from '../../shared/utils/response';
import { resolvePage } from '../../shared/utils/pagination';
import { audit } from '../../shared/utils/audit';
import { projectsService } from './projects.service';
import { createProjectSchema, updateProjectSchema, idParamSchema } from './projects.schema';

// ── Authenticated management API ──────────────────────
export const projectsRouter = Router();
projectsRouter.use(authenticate);

projectsRouter.get(
  '/',
  requirePermission('projects.read'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const publishedParam = req.query.published as string | undefined;
    const { items, meta } = await projectsService.list({
      page,
      limit,
      skip,
      search: (req.query.search as string | undefined) || undefined,
      published: publishedParam === undefined ? undefined : publishedParam === 'true',
    });
    paginated(res, items, meta);
  }),
);

projectsRouter.get(
  '/:id',
  requirePermission('projects.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await projectsService.get(req.params.id))),
);

projectsRouter.post(
  '/',
  requirePermission('projects.write'),
  validate({ body: createProjectSchema }),
  asyncHandler(async (req, res) => {
    const project = await projectsService.create(req.auth?.userId, req.body);
    await audit({ userId: req.auth?.userId, action: 'project.create', entityType: 'project', entityId: project.id, ip: req.ip });
    created(res, project);
  }),
);

projectsRouter.patch(
  '/:id',
  requirePermission('projects.write'),
  validate({ params: idParamSchema, body: updateProjectSchema }),
  asyncHandler(async (req, res) => {
    const project = await projectsService.update(req.params.id, req.body);
    await audit({ userId: req.auth?.userId, action: 'project.update', entityType: 'project', entityId: project.id, ip: req.ip });
    ok(res, project);
  }),
);

projectsRouter.delete(
  '/:id',
  requirePermission('projects.write'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await projectsService.remove(req.params.id);
    await audit({ userId: req.auth?.userId, action: 'project.delete', entityType: 'project', entityId: req.params.id, ip: req.ip });
    noContent(res);
  }),
);

// ── PUBLIC: consumed by www.kratos-energy.com (no auth) ──
export const publicProjectsRouter = Router();

publicProjectsRouter.get(
  '/projects',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, meta } = await projectsService.publicList({ page, limit, skip });
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min edge/browser cache
    paginated(res, items, meta);
  }),
);

publicProjectsRouter.get(
  '/projects/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    ok(res, await projectsService.publicGet(req.params.id));
  }),
);
