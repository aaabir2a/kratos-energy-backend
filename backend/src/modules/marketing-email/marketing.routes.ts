import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { ok, created, paginated, noContent } from '../../shared/utils/response';
import { resolvePage, buildMeta } from '../../shared/utils/pagination';
import { audit } from '../../shared/utils/audit';
import { AppError } from '../../shared/errors/AppError';
import { contactsService } from './contacts.service';
import { importService } from './import.service';
import {
  createListSchema,
  updateListSchema,
  listQuerySchema,
  createContactSchema,
  updateContactSchema,
  contactQuerySchema,
  membershipSchema,
  importMappingSchema,
  idParamSchema,
} from './marketing.schema';

export const marketingEmailRouter = Router();
marketingEmailRouter.use(authenticate);

// CSV lives in memory only long enough to parse — nothing is written to disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Lists ─────────────────────────────────────────────

marketingEmailRouter.get(
  '/lists',
  requirePermission('marketing_email.read'),
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, total } = await contactsService.listLists({
      skip,
      limit,
      search: req.query.search as string | undefined,
    });
    paginated(res, items, buildMeta(page, limit, total));
  }),
);

marketingEmailRouter.post(
  '/lists',
  requirePermission('marketing_email.write'),
  validate({ body: createListSchema }),
  asyncHandler(async (req, res) => created(res, await contactsService.createList(req.body, req.auth!.userId))),
);

marketingEmailRouter.get(
  '/lists/:id',
  requirePermission('marketing_email.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await contactsService.getList(req.params.id))),
);

// How many of this list can actually be emailed, before a campaign is built.
marketingEmailRouter.get(
  '/lists/:id/health',
  requirePermission('marketing_email.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await contactsService.listHealth(req.params.id))),
);

marketingEmailRouter.patch(
  '/lists/:id',
  requirePermission('marketing_email.write'),
  validate({ params: idParamSchema, body: updateListSchema }),
  asyncHandler(async (req, res) => ok(res, await contactsService.updateList(req.params.id, req.body))),
);

marketingEmailRouter.delete(
  '/lists/:id',
  requirePermission('marketing_email.write'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await contactsService.deleteList(req.params.id);
    await audit({
      userId: req.auth?.userId,
      action: 'marketing_email.list_delete',
      entityType: 'contact_list',
      entityId: req.params.id,
      ip: req.ip,
    });
    noContent(res);
  }),
);

marketingEmailRouter.post(
  '/lists/:id/contacts',
  requirePermission('marketing_email.write'),
  validate({ params: idParamSchema, body: membershipSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await contactsService.addToLists([req.params.id], req.body.contactIds)),
  ),
);

marketingEmailRouter.delete(
  '/lists/:id/contacts',
  requirePermission('marketing_email.write'),
  validate({ params: idParamSchema, body: membershipSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await contactsService.removeFromList(req.params.id, req.body.contactIds)),
  ),
);

// ── Contacts ──────────────────────────────────────────

marketingEmailRouter.get(
  '/contacts',
  requirePermission('marketing_email.read'),
  validate({ query: contactQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const query = req.query as unknown as Record<string, never>;
    const { items, total } = await contactsService.listContacts({ ...query, skip, limit });
    paginated(res, items, buildMeta(page, limit, total));
  }),
);

marketingEmailRouter.post(
  '/contacts',
  requirePermission('marketing_email.write'),
  validate({ body: createContactSchema }),
  asyncHandler(async (req, res) => created(res, await contactsService.upsertContact(req.body, req.auth!.userId))),
);

marketingEmailRouter.get(
  '/contacts/:id',
  requirePermission('marketing_email.read'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => ok(res, await contactsService.getContact(req.params.id))),
);

marketingEmailRouter.patch(
  '/contacts/:id',
  requirePermission('marketing_email.write'),
  validate({ params: idParamSchema, body: updateContactSchema }),
  asyncHandler(async (req, res) => ok(res, await contactsService.updateContact(req.params.id, req.body))),
);

marketingEmailRouter.delete(
  '/contacts/:id',
  requirePermission('marketing_email.write'),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await contactsService.deleteContact(req.params.id);
    noContent(res);
  }),
);

// ── Import ────────────────────────────────────────────

// Step one: read the file back with our guess at each column.
marketingEmailRouter.post(
  '/import/preview',
  requirePermission('marketing_email.write'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw AppError.badRequest('Attach a CSV file');
    ok(res, importService.preview(req.file.buffer.toString('utf8')));
  }),
);

// Step two: import against a confirmed mapping.
marketingEmailRouter.post(
  '/import',
  requirePermission('marketing_email.write'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw AppError.badRequest('Attach a CSV file');
    // The mapping arrives as a JSON string beside the file in the form data.
    const parsed = importMappingSchema.safeParse(JSON.parse(String(req.body.mapping ?? '{}')));
    if (!parsed.success) throw AppError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid mapping');

    const result = await importService.import(req.file.buffer.toString('utf8'), parsed.data);
    await audit({
      userId: req.auth?.userId,
      action: 'marketing_email.import',
      entityType: 'contact_list',
      entityId: parsed.data.listId,
      after: { imported: result.imported, updated: result.updated },
      ip: req.ip,
    });
    ok(res, result);
  }),
);
