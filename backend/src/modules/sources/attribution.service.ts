import { prisma } from '../../core/database/prisma';

export interface SourceReportRow {
  sourceId: string | null;
  sourceName: string;
  sourceType: string;
  total: number;
  open: number;
  converted: number;
  lost: number;
  conversionRate: number; // converted / total
}

export const attributionService = {
  // Leads by source with outcome breakdown — the "which channel works" report.
  async bySource(days?: number): Promise<SourceReportRow[]> {
    const since = days ? new Date(Date.now() - days * 86_400_000) : undefined;
    const where = { deletedAt: null, ...(since ? { createdAt: { gte: since } } : {}) };

    const [groups, sources] = await Promise.all([
      prisma.lead.groupBy({
        by: ['leadSourceId', 'status'],
        where,
        _count: { _all: true },
        orderBy: { leadSourceId: 'asc' },
      }),
      prisma.leadSource.findMany(),
    ]);

    const sourceMap = new Map(sources.map((s) => [s.id, s]));
    const rows = new Map<string | null, SourceReportRow>();

    for (const g of groups) {
      const key = g.leadSourceId;
      let row = rows.get(key);
      if (!row) {
        const src = key ? sourceMap.get(key) : undefined;
        row = {
          sourceId: key,
          sourceName: src?.name ?? 'Unknown',
          sourceType: src?.type ?? 'other',
          total: 0,
          open: 0,
          converted: 0,
          lost: 0,
          conversionRate: 0,
        };
        rows.set(key, row);
      }
      const n = g._count._all;
      row.total += n;
      if (g.status === 'OPEN') row.open += n;
      else if (g.status === 'CONVERTED') row.converted += n;
      else if (g.status === 'LOST') row.lost += n;
    }

    const result = [...rows.values()];
    for (const r of result) r.conversionRate = r.total ? Math.round((r.converted / r.total) * 100) : 0;
    return result.sort((a, b) => b.total - a.total);
  },

  // Campaign performance: leads + CPL from campaign spend.
  async byCampaign() {
    const campaigns = await prisma.marketingCampaign.findMany({
      include: { _count: { select: { leads: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return campaigns.map((c) => {
      const leads = c._count.leads;
      const spend = c.spend ? Number(c.spend) : 0;
      return {
        id: c.id,
        name: c.name,
        channel: c.channel,
        utmCampaign: c.utmCampaign,
        budget: c.budget ? Number(c.budget) : null,
        spend: spend || null,
        leads,
        costPerLead: leads && spend ? Math.round((spend / leads) * 100) / 100 : null,
        isActive: c.isActive,
      };
    });
  },

  // Touches for one lead (first + last attributions).
  leadAttributions(leadId: string) {
    return prisma.leadAttribution.findMany({
      where: { leadId },
      orderBy: { createdAt: 'asc' },
      include: { source: { select: { name: true, type: true } }, campaign: { select: { name: true } } },
    });
  },
};
