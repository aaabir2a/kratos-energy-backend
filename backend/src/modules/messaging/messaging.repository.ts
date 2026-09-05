import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';

// Data access only — no business rules. Same split as the leads module.

export const templateListSelect = {
  id: true,
  key: true,
  name: true,
  category: true,
  channel: true,
  subject: true,
  currentVersion: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MessageTemplateSelect;

export const messagingRepository = {
  listTemplates(where: Prisma.MessageTemplateWhereInput, skip: number, take: number) {
    return prisma.$transaction([
      prisma.messageTemplate.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        select: templateListSelect,
      }),
      prisma.messageTemplate.count({ where }),
    ]);
  },

  findTemplate(id: string) {
    return prisma.messageTemplate.findFirst({
      where: { id, deletedAt: null },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 10 },
      },
    });
  },

  findTemplateByKey(key: string) {
    return prisma.messageTemplate.findFirst({ where: { key, deletedAt: null } });
  },

  /** Create the template and its version 1 together — a template without a
   *  version would break the "sent history stays truthful" guarantee. */
  createTemplate(data: Prisma.MessageTemplateUncheckedCreateInput) {
    return prisma.$transaction(async (tx) => {
      const template = await tx.messageTemplate.create({ data });
      await tx.templateVersion.create({
        data: {
          templateId: template.id,
          version: template.currentVersion,
          subject: template.subject,
          bodyHtml: template.bodyHtml,
          bodyText: template.bodyText,
          createdById: template.createdById,
        },
      });
      return template;
    });
  },

  /** Update in place, publishing a new version when the content itself
   *  changed. Renaming or archiving does not burn a version. */
  updateTemplate(id: string, data: Prisma.MessageTemplateUncheckedUpdateInput, contentChanged: boolean) {
    return prisma.$transaction(async (tx) => {
      const next = contentChanged ? { ...data, currentVersion: { increment: 1 } } : data;
      const template = await tx.messageTemplate.update({ where: { id }, data: next });
      if (contentChanged) {
        await tx.templateVersion.create({
          data: {
            templateId: template.id,
            version: template.currentVersion,
            subject: template.subject,
            bodyHtml: template.bodyHtml,
            bodyText: template.bodyText,
            createdById: template.createdById,
          },
        });
      }
      return template;
    });
  },

  /** Soft delete — sent messages still reference this row. */
  softDeleteTemplate(id: string) {
    return prisma.messageTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  },

  countMessagesForTemplate(templateId: string) {
    return prisma.scheduledMessage.count({ where: { templateId } });
  },
};
