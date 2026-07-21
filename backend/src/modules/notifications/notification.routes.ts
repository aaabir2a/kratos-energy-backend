import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { authenticate } from '../../core/middlewares/auth.middleware';
import { requirePermission } from '../../core/middlewares/rbac.middleware';
import { ok, paginated, noContent } from '../../shared/utils/response';
import { resolvePage, buildMeta } from '../../shared/utils/pagination';
import { notificationService } from './notification.service';
import { idParamSchema, settingsSchema } from './notification.schema';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

// My in-app feed.
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePage(req.query);
    const unreadOnly = req.query.unread === 'true';
    const { items, total, unread } = await notificationService.listForUser(req.auth!.userId, { unreadOnly, skip, limit });
    paginated(res, items, { ...buildMeta(page, limit, total), unread } as never);
  }),
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => ok(res, { unread: await notificationService.unreadCount(req.auth!.userId) })),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await notificationService.markAllRead(req.auth!.userId);
    noContent(res);
  }),
);

notificationsRouter.patch(
  '/:id/read',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await notificationService.markRead(req.auth!.userId, req.params.id);
    noContent(res);
  }),
);

// ── Shared-recipient settings (admin) ─────────────────
notificationsRouter.get(
  '/settings',
  requirePermission('settings.read'),
  asyncHandler(async (_req, res) => ok(res, { adminEmails: await notificationService.getAdminEmails() })),
);

notificationsRouter.put(
  '/settings',
  requirePermission('settings.write'),
  validate({ body: settingsSchema }),
  asyncHandler(async (req, res) => ok(res, { adminEmails: await notificationService.setAdminEmails(req.body.adminEmails) })),
);
