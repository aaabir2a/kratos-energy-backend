import type { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import { audit } from '../../shared/utils/audit';
import { rolesService } from './roles.service';

export const rolesController = {
  async list(_req: Request, res: Response) {
    ok(res, await rolesService.list());
  },

  async listPermissions(_req: Request, res: Response) {
    ok(res, await rolesService.listPermissions());
  },

  async get(req: Request, res: Response) {
    ok(res, await rolesService.get(req.params.id));
  },

  async setPermissions(req: Request, res: Response) {
    const role = await rolesService.setPermissions(req.params.id, req.body.permissions);
    await audit({
      userId: req.auth?.userId,
      action: 'role.permissions.update',
      entityType: 'role',
      entityId: req.params.id,
      after: req.body.permissions,
      ip: req.ip,
    });
    ok(res, role);
  },
};
