import { prisma } from '../../core/database/prisma';
import { buildLeadScope, type AuthContext } from '../leads/leads.scope';

const leadCardSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  suburb: true,
  state: true,
  priority: true,
  score: true,
  estimatedSystemSize: true,
  createdAt: true,
  stageId: true,
  source: { select: { name: true, type: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
} as const;

export const pipelineService = {
  listStages(track: 'LEAD' | 'DEAL') {
    return prisma.pipelineStage.findMany({ where: { track }, orderBy: { order: 'asc' } });
  },

  async board(auth: AuthContext) {
    const [stages, leads] = await Promise.all([
      prisma.pipelineStage.findMany({ where: { track: 'LEAD' }, orderBy: { order: 'asc' } }),
      prisma.lead.findMany({
        where: { ...buildLeadScope(auth), status: 'OPEN' },
        select: leadCardSelect,
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);

    const byStage = new Map<string, typeof leads>();
    const unstaged: typeof leads = [];
    for (const lead of leads) {
      if (lead.stageId) {
        const arr = byStage.get(lead.stageId) ?? [];
        arr.push(lead);
        byStage.set(lead.stageId, arr);
      } else {
        unstaged.push(lead);
      }
    }

    return stages.map((stage) => ({
      ...stage,
      leads: byStage.get(stage.id) ?? (stage.isDefault ? unstaged : []),
    }));
  },
};
