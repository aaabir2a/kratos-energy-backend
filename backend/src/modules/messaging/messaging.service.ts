import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError';
import { messagingRepository } from './messaging.repository';
import { unknownMergeFields, renderTemplate, MERGE_FIELDS, type MergeData } from './merge';
import type { CreateTemplateInput, ListTemplatesQuery, UpdateTemplateInput } from './messaging.schema';

// Sample data for the editor preview, so a template can be checked before any
// lead is chosen.
const PREVIEW_LEAD: MergeData = {
  firstName: 'Jordan',
  lastName: 'Reid',
  fullName: 'Jordan Reid',
  suburb: 'Penrith',
  state: 'NSW',
  enquiryType: 'residential',
  repName: 'Sam Taylor',
};

export const messagingService = {
  mergeFields() {
    return MERGE_FIELDS;
  },

  async listTemplates(params: ListTemplatesQuery & { skip: number; limit: number }) {
    const where: Prisma.MessageTemplateWhereInput = {
      deletedAt: null,
      ...(params.category ? { category: params.category } : {}),
      ...(params.channel ? { channel: params.channel } : {}),
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { subject: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await messagingRepository.listTemplates(where, params.skip, params.limit);
    return { items, total };
  },

  async getTemplate(id: string) {
    const template = await messagingRepository.findTemplate(id);
    if (!template) throw AppError.notFound('Template not found');
    return template;
  },

  async createTemplate(input: CreateTemplateInput, userId: string) {
    this.assertRenderable(input.bodyHtml, input.subject);
    if (input.key) {
      const clash = await messagingRepository.findTemplateByKey(input.key);
      if (clash) throw AppError.conflict(`A template with the key "${input.key}" already exists`);
    }
    return messagingRepository.createTemplate({
      name: input.name,
      key: input.key,
      category: input.category ?? 'OTHER',
      channel: input.channel ?? 'EMAIL',
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      isActive: input.isActive ?? true,
      createdById: userId,
    });
  },

  async updateTemplate(id: string, input: UpdateTemplateInput) {
    const existing = await this.getTemplate(id);

    const nextHtml = input.bodyHtml ?? existing.bodyHtml;
    const nextSubject = input.subject ?? existing.subject ?? undefined;
    if (input.bodyHtml !== undefined || input.subject !== undefined) {
      this.assertRenderable(nextHtml, nextSubject);
    }

    // Only body/subject changes publish a new version; a rename does not.
    const contentChanged =
      (input.bodyHtml !== undefined && input.bodyHtml !== existing.bodyHtml) ||
      (input.bodyText !== undefined && input.bodyText !== existing.bodyText) ||
      (input.subject !== undefined && input.subject !== existing.subject);

    return messagingRepository.updateTemplate(id, { ...input }, contentChanged);
  },

  async deleteTemplate(id: string) {
    await this.getTemplate(id);
    return messagingRepository.softDeleteTemplate(id);
  },

  /** Render with sample data for the editor preview. */
  async previewTemplate(id: string) {
    const template = await this.getTemplate(id);
    return {
      subject: template.subject ? renderTemplate(template.subject, PREVIEW_LEAD, { escape: false }) : null,
      bodyHtml: renderTemplate(template.bodyHtml, PREVIEW_LEAD),
      bodyText: template.bodyText ? renderTemplate(template.bodyText, PREVIEW_LEAD, { escape: false }) : null,
      sampleData: PREVIEW_LEAD,
    };
  },

  /** Refuse copy that references merge fields we cannot fill. Catching this at
   *  save time is the difference between a preview warning and a customer
   *  receiving a literal {{frstName}}. */
  assertRenderable(bodyHtml: string, subject?: string | null) {
    const unknown = [...new Set([...unknownMergeFields(bodyHtml), ...unknownMergeFields(subject ?? '')])];
    if (unknown.length) {
      throw AppError.badRequest(
        `Unknown merge field${unknown.length > 1 ? 's' : ''}: ${unknown.map((f) => `{{${f}}}`).join(', ')}`,
      );
    }
  },
};
