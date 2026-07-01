import type { Request, Response } from 'express';
import { ok, created, paginated, noContent } from '../../shared/utils/response';
import { resolvePage } from '../../shared/utils/pagination';
import { audit } from '../../shared/utils/audit';
import { officesService } from './offices.service';

export const officesController = {
  async list(req: Request, res: Response) {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, meta } = await officesService.list({
      page,
      limit,
      skip,
      search: req.query.search as string | undefined,
    });
    paginated(res, items, meta);
  },

  async get(req: Request, res: Response) {
    ok(res, await officesService.getById(req.params.id));
  },

  async create(req: Request, res: Response) {
    const office = await officesService.create(req.body);
    await audit({ userId: req.auth?.userId, action: 'office.create', entityType: 'office', entityId: office.id, after: office, ip: req.ip });
    created(res, office);
  },

  async update(req: Request, res: Response) {
    const office = await officesService.update(req.params.id, req.body);
    await audit({ userId: req.auth?.userId, action: 'office.update', entityType: 'office', entityId: office.id, after: office, ip: req.ip });
    ok(res, office);
  },

  async remove(req: Request, res: Response) {
    await officesService.remove(req.params.id);
    await audit({ userId: req.auth?.userId, action: 'office.delete', entityType: 'office', entityId: req.params.id, ip: req.ip });
    noContent(res);
  },
};
