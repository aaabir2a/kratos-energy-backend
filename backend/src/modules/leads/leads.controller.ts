import type { Request, Response } from 'express';
import { ok, created, paginated, noContent } from '../../shared/utils/response';
import { resolvePage } from '../../shared/utils/pagination';
import { audit } from '../../shared/utils/audit';
import { leadsService } from './leads.service';
import type { AuthContext } from './leads.scope';

const ctx = (req: Request): AuthContext => req.auth as AuthContext;

export const leadsController = {
  async list(req: Request, res: Response) {
    const { page, limit, skip } = resolvePage(req.query);
    const { items, meta } = await leadsService.list(ctx(req), {
      page,
      limit,
      skip,
      search: req.query.search as string | undefined,
      stageId: req.query.stageId as string | undefined,
      status: req.query.status as never,
      priority: req.query.priority as never,
      assignedToId: req.query.assignedToId as string | undefined,
      leadSourceId: req.query.leadSourceId as string | undefined,
      sort: req.query.sort as never,
      order: req.query.order as never,
    });
    paginated(res, items, meta);
  },

  async stats(req: Request, res: Response) {
    ok(res, await leadsService.stats(ctx(req)));
  },

  async get(req: Request, res: Response) {
    ok(res, await leadsService.getById(ctx(req), req.params.id));
  },

  async create(req: Request, res: Response) {
    const lead = await leadsService.create(ctx(req), req.body);
    await audit({ userId: req.auth?.userId, action: 'lead.create', entityType: 'lead', entityId: lead.id, ip: req.ip });
    created(res, lead);
  },

  async update(req: Request, res: Response) {
    const lead = await leadsService.update(ctx(req), req.params.id, req.body);
    await audit({ userId: req.auth?.userId, action: 'lead.update', entityType: 'lead', entityId: lead.id, ip: req.ip });
    ok(res, lead);
  },

  async remove(req: Request, res: Response) {
    await leadsService.remove(ctx(req), req.params.id);
    await audit({ userId: req.auth?.userId, action: 'lead.delete', entityType: 'lead', entityId: req.params.id, ip: req.ip });
    noContent(res);
  },

  async assign(req: Request, res: Response) {
    const lead = await leadsService.assign(ctx(req), req.params.id, req.body.assignedToId, req.body.autoAssign);
    await audit({ userId: req.auth?.userId, action: 'lead.assign', entityType: 'lead', entityId: req.params.id, after: { assignedToId: req.body.assignedToId }, ip: req.ip });
    ok(res, lead);
  },

  async moveStage(req: Request, res: Response) {
    const lead = await leadsService.moveStage(ctx(req), req.params.id, req.body.stageId, req.body.reason);
    await audit({ userId: req.auth?.userId, action: 'lead.stage', entityType: 'lead', entityId: req.params.id, after: { stageId: req.body.stageId }, ip: req.ip });
    ok(res, lead);
  },

  async markLost(req: Request, res: Response) {
    const lead = await leadsService.markLost(ctx(req), req.params.id, req.body.lostReason);
    await audit({ userId: req.auth?.userId, action: 'lead.lost', entityType: 'lead', entityId: req.params.id, ip: req.ip });
    ok(res, lead);
  },

  async addNote(req: Request, res: Response) {
    created(res, await leadsService.addNote(ctx(req), req.params.id, req.body.body, req.body.isPinned));
  },
  async listNotes(req: Request, res: Response) {
    ok(res, await leadsService.listNotes(ctx(req), req.params.id));
  },

  async addActivity(req: Request, res: Response) {
    created(res, await leadsService.addActivity(ctx(req), req.params.id, req.body));
  },
  async listActivities(req: Request, res: Response) {
    ok(res, await leadsService.listActivities(ctx(req), req.params.id));
  },
};
