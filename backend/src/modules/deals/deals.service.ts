import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { AppError } from '../../shared/errors/AppError';
import { buildMeta } from '../../shared/utils/pagination';
import type { AuthContext } from '../leads/leads.scope';

const dealInclude = {
  stage: true,
  owner: { select: { id: true, firstName: true, lastName: true } },
  lead: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      suburb: true,
      state: true,
      source: { select: { name: true, type: true } },
    },
  },
  items: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.DealInclude;

// Row-level visibility (mirrors leads): admin/marketing all, manager own office, sales own deals.
function buildDealScope(auth: AuthContext): Prisma.DealWhereInput {
  const base: Prisma.DealWhereInput = { deletedAt: null };
  switch (auth.role) {
    case 'admin':
    case 'marketing':
      return base;
    case 'manager':
      return auth.officeId ? { ...base, officeId: auth.officeId } : base;
    default:
      return { ...base, ownerId: auth.userId };
  }
}

function assertVisible(auth: AuthContext, deal: { ownerId: string | null; officeId: string | null }): void {
  if (auth.role === 'sales' && deal.ownerId !== auth.userId) {
    throw AppError.forbidden('This deal is not yours');
  }
  if (auth.role === 'manager' && auth.officeId && deal.officeId && deal.officeId !== auth.officeId) {
    throw AppError.forbidden('This deal belongs to another office');
  }
}

async function getDealStage(slugOrDefault: 'default' | 'won' | 'lost' | string) {
  if (slugOrDefault === 'default') {
    return (
      (await prisma.pipelineStage.findFirst({ where: { track: 'DEAL', isDefault: true } })) ??
      (await prisma.pipelineStage.findFirst({ where: { track: 'DEAL' }, orderBy: { order: 'asc' } }))
    );
  }
  if (slugOrDefault === 'won') return prisma.pipelineStage.findFirst({ where: { track: 'DEAL', isWon: true } });
  if (slugOrDefault === 'lost') return prisma.pipelineStage.findFirst({ where: { track: 'DEAL', isLost: true } });
  return prisma.pipelineStage.findUnique({ where: { id: slugOrDefault } });
}

function sumItems(items: { quantity: number; unitPrice: number }[]): number {
  return items.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);
}

interface ConvertInput {
  title?: string;
  value?: number;
  expectedCloseDate?: string;
  items?: { itemType?: 'PACKAGE' | 'PRODUCT' | 'CUSTOM'; productId?: string; packageId?: string; description: string; quantity: number; unitPrice: number }[];
}

export const dealsService = {
  // Lead → Deal. Marks lead CONVERTED, owner = lead's assignee (or converter).
  async convertLead(auth: AuthContext, leadId: string, input: ConvertInput) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead not found');
    if (auth.role === 'sales' && lead.assignedToId !== auth.userId) {
      throw AppError.forbidden('This lead is not assigned to you');
    }
    if (lead.status === 'CONVERTED') {
      const existing = await prisma.deal.findFirst({ where: { leadId, deletedAt: null } });
      throw AppError.conflict('Lead is already converted', { dealId: existing?.id });
    }

    const stage = await getDealStage('default');
    const itemsValue = input.items?.length ? sumItems(input.items) : 0;
    const value = input.value ?? itemsValue;
    const ownerId = lead.assignedToId ?? auth.userId;

    const deal = await prisma.deal.create({
      data: {
        title:
          input.title ??
          `${lead.firstName} ${lead.lastName}${lead.estimatedSystemSize ? ` — ${lead.estimatedSystemSize}` : ''}`,
        leadId: lead.id,
        ownerId,
        officeId: lead.officeId,
        stageId: stage?.id,
        value,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
        createdById: auth.userId,
        items: input.items?.length
          ? {
              create: input.items.map((i, idx) => ({
                itemType: i.itemType ?? 'CUSTOM',
                productId: i.productId,
                packageId: i.packageId,
                description: i.description,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                lineTotal: i.quantity * i.unitPrice,
                sortOrder: idx,
              })),
            }
          : undefined,
      },
      include: dealInclude,
    });

    await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: { status: 'CONVERTED', convertedAt: new Date() },
      }),
      prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: auth.userId,
          type: 'SYSTEM',
          subject: 'Converted to deal',
          body: `Deal D-${deal.dealNumber} created${value ? ` (value $${value.toLocaleString()})` : ''}.`,
        },
      }),
      prisma.dealStageHistory.create({
        data: { dealId: deal.id, toStageId: stage?.id, changedById: auth.userId, reason: 'Deal created' },
      }),
    ]);

    return deal;
  },

  async list(
    auth: AuthContext,
    params: {
      page: number;
      limit: number;
      skip: number;
      search?: string;
      stageId?: string;
      status?: 'OPEN' | 'WON' | 'LOST';
      ownerId?: string;
    },
  ) {
    const where: Prisma.DealWhereInput = {
      ...buildDealScope(auth),
      ...(params.stageId ? { stageId: params.stageId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.ownerId ? { ownerId: params.ownerId } : {}),
      ...(params.search
        ? {
            OR: [
              { title: { contains: params.search, mode: 'insensitive' } },
              { lead: { firstName: { contains: params.search, mode: 'insensitive' } } },
              { lead: { lastName: { contains: params.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.deal.findMany({ where, skip: params.skip, take: params.limit, orderBy: { createdAt: 'desc' }, include: dealInclude }),
      prisma.deal.count({ where }),
    ]);
    return { items, meta: buildMeta(params.page, params.limit, total) };
  },

  async getById(auth: AuthContext, id: string) {
    const deal = await prisma.deal.findFirst({
      where: { id, deletedAt: null },
      include: { ...dealInclude, stageHistory: { orderBy: { changedAt: 'desc' }, include: { changedBy: { select: { firstName: true, lastName: true } } } } },
    });
    if (!deal) throw AppError.notFound('Deal not found');
    assertVisible(auth, deal);
    return deal;
  },

  async update(auth: AuthContext, id: string, input: { title?: string; value?: number; expectedCloseDate?: string | null; ownerId?: string }) {
    const deal = await this.getById(auth, id);
    if (deal.status !== 'OPEN') throw AppError.badRequest('Closed deals cannot be edited');
    return prisma.deal.update({
      where: { id },
      data: {
        title: input.title,
        value: input.value,
        ownerId: input.ownerId,
        expectedCloseDate:
          input.expectedCloseDate === null ? null : input.expectedCloseDate ? new Date(input.expectedCloseDate) : undefined,
      },
      include: dealInclude,
    });
  },

  async addItem(auth: AuthContext, id: string, input: { itemType?: 'PACKAGE' | 'PRODUCT' | 'CUSTOM'; productId?: string; packageId?: string; description: string; quantity: number; unitPrice: number }) {
    const deal = await this.getById(auth, id);
    if (deal.status !== 'OPEN') throw AppError.badRequest('Closed deals cannot be edited');
    const item = await prisma.dealItem.create({
      data: {
        dealId: id,
        itemType: input.itemType ?? 'CUSTOM',
        productId: input.productId,
        packageId: input.packageId,
        description: input.description,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        lineTotal: input.quantity * input.unitPrice,
        sortOrder: deal.items.length,
      },
    });
    // Keep deal.value in sync with item sum.
    const agg = await prisma.dealItem.aggregate({ where: { dealId: id }, _sum: { lineTotal: true } });
    await prisma.deal.update({ where: { id }, data: { value: agg._sum.lineTotal ?? 0 } });
    return item;
  },

  async removeItem(auth: AuthContext, id: string, itemId: string) {
    const deal = await this.getById(auth, id);
    if (deal.status !== 'OPEN') throw AppError.badRequest('Closed deals cannot be edited');
    await prisma.dealItem.delete({ where: { id: itemId } });
    const agg = await prisma.dealItem.aggregate({ where: { dealId: id }, _sum: { lineTotal: true } });
    await prisma.deal.update({ where: { id }, data: { value: agg._sum.lineTotal ?? 0 } });
  },

  async moveStage(auth: AuthContext, id: string, stageId: string, reason?: string) {
    const deal = await this.getById(auth, id);
    if (deal.status !== 'OPEN') throw AppError.badRequest('Deal is already closed');
    const stage = await getDealStage(stageId);
    if (!stage || stage.track !== 'DEAL') throw AppError.notFound('Deal stage not found');

    const updated = await prisma.deal.update({
      where: { id },
      data: {
        stageId: stage.id,
        ...(stage.isWon ? { status: 'WON', closedAt: new Date() } : {}),
        ...(stage.isLost ? { status: 'LOST', closedAt: new Date() } : {}),
      },
      include: dealInclude,
    });
    await prisma.dealStageHistory.create({
      data: { dealId: id, fromStageId: deal.stageId, toStageId: stage.id, changedById: auth.userId, reason },
    });
    return updated;
  },

  async win(auth: AuthContext, id: string) {
    const stage = await getDealStage('won');
    if (!stage) throw AppError.notFound('No won stage configured');
    const deal = await this.moveStage(auth, id, stage.id, 'Closed won');
    await prisma.leadActivity.create({
      data: { leadId: deal.leadId, userId: auth.userId, type: 'SYSTEM', subject: 'Deal won', body: `D-${deal.dealNumber} closed won ($${Number(deal.value).toLocaleString()}).` },
    });
    return deal;
  },

  async lose(auth: AuthContext, id: string, lostReason: string) {
    const stage = await getDealStage('lost');
    if (!stage) throw AppError.notFound('No lost stage configured');
    const deal = await this.moveStage(auth, id, stage.id, lostReason);
    const updated = await prisma.deal.update({ where: { id }, data: { lostReason }, include: dealInclude });
    await prisma.leadActivity.create({
      data: { leadId: deal.leadId, userId: auth.userId, type: 'SYSTEM', subject: 'Deal lost', body: lostReason },
    });
    return updated;
  },

  async stats(auth: AuthContext) {
    const scope = buildDealScope(auth);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [open, wonMtd, lostMtd, openValue, wonValueMtd] = await prisma.$transaction([
      prisma.deal.count({ where: { ...scope, status: 'OPEN' } }),
      prisma.deal.count({ where: { ...scope, status: 'WON', closedAt: { gte: monthStart } } }),
      prisma.deal.count({ where: { ...scope, status: 'LOST', closedAt: { gte: monthStart } } }),
      prisma.deal.aggregate({ where: { ...scope, status: 'OPEN' }, _sum: { value: true } }),
      prisma.deal.aggregate({ where: { ...scope, status: 'WON', closedAt: { gte: monthStart } }, _sum: { value: true } }),
    ]);
    const closedMtd = wonMtd + lostMtd;
    return {
      open,
      openValue: Number(openValue._sum.value ?? 0),
      wonMtd,
      wonValueMtd: Number(wonValueMtd._sum.value ?? 0),
      winRateMtd: closedMtd ? Math.round((wonMtd / closedMtd) * 100) : 0,
    };
  },
};
