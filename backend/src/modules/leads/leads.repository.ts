import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';

export const leadListSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  suburb: true,
  state: true,
  status: true,
  priority: true,
  score: true,
  estimatedSystemSize: true,
  nextFollowUpAt: true,
  createdAt: true,
  customFormResponses: true, // origin markers (lead_source/build_*) for list badges
  stage: { select: { id: true, name: true, slug: true, color: true } },
  source: { select: { id: true, name: true, type: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.LeadSelect;

const leadDetailInclude = {
  stage: true,
  source: true,
  office: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.LeadInclude;

export const leadsRepository = {
  list(where: Prisma.LeadWhereInput, orderBy: Prisma.LeadOrderByWithRelationInput, skip: number, take: number) {
    return prisma.$transaction([
      prisma.lead.findMany({ where, orderBy, skip, take, select: leadListSelect }),
      prisma.lead.count({ where }),
    ]);
  },

  findById(id: string) {
    return prisma.lead.findFirst({ where: { id, deletedAt: null }, include: leadDetailInclude });
  },

  findDuplicate(email: string | null, phone: string | null) {
    if (!email && !phone) return Promise.resolve(null);
    const or: Prisma.LeadWhereInput[] = [];
    if (email) or.push({ email });
    if (phone) or.push({ phone });
    return prisma.lead.findFirst({ where: { deletedAt: null, OR: or }, include: leadDetailInclude });
  },

  create(data: Prisma.LeadCreateInput) {
    return prisma.lead.create({ data, include: leadDetailInclude });
  },

  update(id: string, data: Prisma.LeadUpdateInput) {
    return prisma.lead.update({ where: { id }, data, include: leadDetailInclude });
  },

  softDelete(id: string) {
    return prisma.lead.update({ where: { id }, data: { deletedAt: new Date() }, select: { id: true } });
  },

  // Notes
  addNote(data: Prisma.LeadNoteUncheckedCreateInput) {
    return prisma.leadNote.create({
      data,
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  },
  listNotes(leadId: string) {
    return prisma.leadNote.findMany({
      where: { leadId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  },

  // Activities
  addActivity(data: Prisma.LeadActivityUncheckedCreateInput) {
    return prisma.leadActivity.create({
      data,
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  },
  listActivities(leadId: string) {
    return prisma.leadActivity.findMany({
      where: { leadId },
      orderBy: { occurredAt: 'desc' },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  },

  recordStatusHistory(data: Prisma.LeadStatusHistoryUncheckedCreateInput) {
    return prisma.leadStatusHistory.create({ data });
  },

  recordAssignment(data: Prisma.LeadAssignmentUncheckedCreateInput) {
    return prisma.leadAssignment.create({ data });
  },

  // Dashboard stats (scoped where)
  async stats(where: Prisma.LeadWhereInput) {
    const [total, open, converted, lost, byStage, bySource] = await prisma.$transaction([
      prisma.lead.count({ where }),
      prisma.lead.count({ where: { ...where, status: 'OPEN' } }),
      prisma.lead.count({ where: { ...where, status: 'CONVERTED' } }),
      prisma.lead.count({ where: { ...where, status: 'LOST' } }),
      prisma.lead.groupBy({ by: ['stageId'], where: { ...where, status: 'OPEN' }, _count: { _all: true }, orderBy: { stageId: 'asc' } }),
      prisma.lead.groupBy({ by: ['leadSourceId'], where, _count: { _all: true }, orderBy: { leadSourceId: 'asc' } }),
    ]);
    return { total, open, converted, lost, byStage, bySource };
  },
};
