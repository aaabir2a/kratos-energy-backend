import type { Request, Response } from 'express';
import { ok, created, paginated, noContent } from '../../shared/utils/response';
import { resolvePage } from '../../shared/utils/pagination';
import { audit } from '../../shared/utils/audit';
import { usersService } from './users.service';

export const usersController = {
  async list(req: Request, res: Response) {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, meta } = await usersService.list({
      page,
      limit,
      skip,
      search: req.query.search as string | undefined,
      roleId: req.query.roleId as string | undefined,
      officeId: req.query.officeId as string | undefined,
      isActive: req.query.isActive as unknown as boolean | undefined,
    });
    paginated(res, items, meta);
  },

  async get(req: Request, res: Response) {
    ok(res, await usersService.getById(req.params.id));
  },

  async create(req: Request, res: Response) {
    const user = await usersService.create(req.body);
    await audit({ userId: req.auth?.userId, action: 'user.create', entityType: 'user', entityId: user.id, after: user, ip: req.ip });
    created(res, user);
  },

  async update(req: Request, res: Response) {
    const user = await usersService.update(req.params.id, req.body);
    await audit({ userId: req.auth?.userId, action: 'user.update', entityType: 'user', entityId: user.id, after: user, ip: req.ip });
    ok(res, user);
  },

  async remove(req: Request, res: Response) {
    await usersService.remove(req.params.id, req.auth!.userId);
    await audit({ userId: req.auth?.userId, action: 'user.delete', entityType: 'user', entityId: req.params.id, ip: req.ip });
    noContent(res);
  },
};
