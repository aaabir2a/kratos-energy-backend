import type { Request, Response } from 'express';
import { ok, created, paginated, noContent } from '../../shared/utils/response';
import { resolvePage } from '../../shared/utils/pagination';
import { audit } from '../../shared/utils/audit';
import { toCsv } from '../../shared/utils/csv';
import { AppError } from '../../shared/errors/AppError';
import { leadsService } from './leads.service';
import { leadsImportService } from './leadsImport.service';
import type { AuthContext } from './leads.scope';

const ctx = (req: Request): AuthContext => req.auth as AuthContext;

// The CSV arrives either as a multipart file ("file") or as raw text in the
// JSON body ("csv"), so the UI can paste as well as upload.
function readUpload(req: Request): string {
  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  if (file) return file.buffer.toString('utf8');
  const body = (req.body as { csv?: unknown } | undefined)?.csv;
  if (typeof body === 'string' && body.trim()) return body;
  throw AppError.badRequest('No CSV supplied — upload a file (field "file") or send { csv: "..." }');
}

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

  // Column spec shown in the import dialog.
  importSpec(_req: Request, res: Response) {
    ok(res, { columns: leadsImportService.columns });
  },

  // Blank CSV with the expected headers + one example row.
  importTemplate(_req: Request, res: Response) {
    const cols = leadsImportService.columns;
    const csv = toCsv(cols.map((c) => c.header), [cols.map((c) => c.example)]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kratos-leads-import-template.csv"');
    res.send(csv);
  },

  // Dry run: validate the uploaded file and report exactly which cells to fix.
  async importValidate(req: Request, res: Response) {
    const csvText = readUpload(req);
    const { ready: _ready, ...report } = await leadsImportService.analyse(csvText);
    ok(res, report);
  },

  // Create the rows that passed validation.
  async importCommit(req: Request, res: Response) {
    const csvText = readUpload(req);
    const { ready: _ready, ...report } = await leadsImportService.commit(ctx(req), csvText);
    await audit({ userId: req.auth?.userId, action: 'lead.import', entityType: 'lead', after: { imported: report.imported }, ip: req.ip });
    ok(res, report);
  },

  // CSV download. Honours the caller's row-level scope plus the same filters as
  // the list view, so a rep can only ever export their own leads.
  async exportCsv(req: Request, res: Response) {
    const q = req.query as Record<string, string | undefined>;
    const rows = await leadsService.exportRows(ctx(req), {
      search: q.search,
      stageId: q.stageId,
      status: q.status as never,
      priority: q.priority as never,
      assignedToId: q.assignedToId,
      leadSourceId: q.leadSourceId,
      origin: q.origin,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
    });

    const custom = (r: (typeof rows)[number], key: string) => {
      const c = r.customFormResponses as Record<string, unknown> | null;
      const v = c?.[key];
      return v === undefined || v === null ? '' : String(v);
    };

    const csv = toCsv(
      [
        'First name', 'Last name', 'Email', 'Phone', 'Secondary phone',
        'Address', 'Suburb', 'State', 'Postcode',
        'Status', 'Stage', 'Priority', 'Score',
        'Source', 'Origin', 'Landing page / form',
        'Assigned to', 'Assigned email', 'Office',
        'System size', 'Property type', 'Roof type', 'Marketing consent',
        'UTM source', 'UTM medium', 'UTM campaign',
        'Next follow-up', 'Created at',
      ],
      rows.map((r) => [
        r.firstName, r.lastName, r.email, r.phone, r.secondaryPhone,
        r.addressLine, r.suburb, r.state, r.postcode,
        r.status, r.stage?.name, r.priority, r.score,
        r.source?.name, custom(r, 'lead_source'), custom(r, 'page_title') || custom(r, 'form_title'),
        r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}`.trim() : '',
        r.assignedTo?.email, r.office?.name,
        r.estimatedSystemSize, r.propertyType, r.roofType, r.consentMarketing,
        r.utmSource, r.utmMedium, r.utmCampaign,
        r.nextFollowUpAt, r.createdAt,
      ]),
    );

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kratos-leads-${stamp}.csv"`);
    await audit({ userId: req.auth?.userId, action: 'lead.export', entityType: 'lead', after: { rows: rows.length }, ip: req.ip });
    res.send(csv);
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
  async listAttributions(req: Request, res: Response) {
    ok(res, await leadsService.listAttributions(ctx(req), req.params.id));
  },
};
