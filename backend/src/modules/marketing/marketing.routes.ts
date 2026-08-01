import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { ok, created, paginated, noContent } from '../../shared/utils/response';
import { resolvePage } from '../../shared/utils/pagination';
import { audit } from '../../shared/utils/audit';
import { marketingService } from './marketing.service';
import {
  createPageSchema,
  updatePageSchema,
  createFormSchema,
  updateFormSchema,
  upsertGlobalFormSchema,
  idParamSchema,
  slugParamSchema,
} from './marketing.schema';

// ── Authenticated management API ──────────────────────
export const landingPagesRouter = Router();
landingPagesRouter.use(authenticate);

landingPagesRouter.get(
  '/',
  requirePermission('landing_pages.read'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, meta } = await marketingService.listPages({
      page,
      limit,
      skip,
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
    });
    paginated(res, items, meta);
  }),
);

landingPagesRouter.get(
  '/:id',
  requirePermission('landing_pages.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await marketingService.getPage(req.params.id))),
);

landingPagesRouter.post(
  '/',
  requirePermission('landing_pages.write'),
  validate({ body: createPageSchema }),
  asyncHandler(async (req, res) => {
    const page = await marketingService.createPage(req.auth!.userId, req.auth!.officeId, req.body);
    await audit({ userId: req.auth?.userId, action: 'landing_page.create', entityType: 'landing_page', entityId: page.id, ip: req.ip });
    created(res, page);
  }),
);

landingPagesRouter.patch(
  '/:id',
  requirePermission('landing_pages.write'),
  validate({ params: idParamSchema, body: updatePageSchema }),
  asyncHandler(async (req, res) => {
    const page = await marketingService.updatePage(req.params.id, req.body);
    await audit({ userId: req.auth?.userId, action: 'landing_page.update', entityType: 'landing_page', entityId: page.id, ip: req.ip });
    ok(res, page);
  }),
);

landingPagesRouter.delete(
  '/:id',
  requirePermission('landing_pages.write'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await marketingService.deletePage(req.params.id);
    await audit({ userId: req.auth?.userId, action: 'landing_page.delete', entityType: 'landing_page', entityId: req.params.id, ip: req.ip });
    noContent(res);
  }),
);

// Standalone form management.
export const formsRouter = Router();
formsRouter.use(authenticate);

// Global site form (singleton, not tied to a page). Literal paths declared
// before /:id so they don't get captured as an id.
formsRouter.get(
  '/global',
  requirePermission('forms.read'),
  asyncHandler(async (_req, res) => ok(res, await marketingService.getGlobalForm())),
);

formsRouter.put(
  '/global',
  requirePermission('forms.write'),
  validate({ body: upsertGlobalFormSchema }),
  asyncHandler(async (req, res) => {
    const form = await marketingService.upsertGlobalForm(req.body);
    await audit({ userId: req.auth?.userId, action: 'global_form.upsert', entityType: 'custom_lead_form', entityId: form.id, ip: req.ip });
    ok(res, form);
  }),
);

formsRouter.get(
  '/',
  requirePermission('forms.read'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, meta } = await marketingService.listForms({
      page,
      limit,
      skip,
      search: req.query.search as string | undefined,
    });
    paginated(res, items, meta);
  }),
);

formsRouter.get(
  '/:id',
  requirePermission('forms.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await marketingService.getForm(req.params.id))),
);

formsRouter.post(
  '/',
  requirePermission('forms.write'),
  validate({ body: createFormSchema }),
  asyncHandler(async (req, res) => {
    const form = await marketingService.createForm(req.body);
    await audit({ userId: req.auth?.userId, action: 'custom_form.create', entityType: 'custom_lead_form', entityId: form.id, ip: req.ip });
    created(res, form);
  }),
);

formsRouter.patch(
  '/:id',
  requirePermission('forms.write'),
  validate({ params: idParamSchema, body: updateFormSchema }),
  asyncHandler(async (req, res) => {
    const form = await marketingService.updateForm(req.params.id, req.body);
    await audit({ userId: req.auth?.userId, action: 'custom_form.update', entityType: 'custom_lead_form', entityId: form.id, ip: req.ip });
    ok(res, form);
  }),
);

formsRouter.delete(
  '/:id',
  requirePermission('forms.write'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await marketingService.deleteForm(req.params.id);
    await audit({ userId: req.auth?.userId, action: 'custom_form.delete', entityType: 'custom_lead_form', entityId: req.params.id, ip: req.ip });
    noContent(res);
  }),
);

// ── Public page delivery (no auth) ────────────────────
export const publicPagesRouter = Router();
publicPagesRouter.get(
  '/:slug',
  validate({ params: slugParamSchema }),
  asyncHandler(async (req, res) => ok(res, await marketingService.publicPage(req.params.slug))),
);

// ── Public global-form / custom-form delivery (no auth) ─────────────
export const publicFormRouter = Router();
publicFormRouter.get(
  '/lead-form',
  asyncHandler(async (req, res) => {
    const id = req.query.id as string | undefined;
    if (id) {
      return ok(res, await marketingService.publicForm(id));
    }
    return ok(res, await marketingService.publicGlobalForm());
  }),
);

publicFormRouter.get(
  '/lead-form/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await marketingService.publicForm(req.params.id))),
);
