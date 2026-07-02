import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { AppError } from '../../shared/errors/AppError';
import { buildMeta } from '../../shared/utils/pagination';
import { logger } from '../../core/logger/logger';

const pageInclude = {
  campaign: { select: { id: true, name: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  forms: { orderBy: { createdAt: 'asc' as const } },
  _count: { select: { leads: true } },
} satisfies Prisma.LandingPageInclude;

export const marketingService = {
  async listPages(params: { page: number; limit: number; skip: number; search?: string; status?: string }) {
    const where: Prisma.LandingPageWhereInput = {
      deletedAt: null,
      ...(params.status ? { status: params.status as never } : {}),
      ...(params.search
        ? {
            OR: [
              { title: { contains: params.search, mode: 'insensitive' } },
              { urlSlug: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.landingPage.findMany({ where, skip: params.skip, take: params.limit, orderBy: { createdAt: 'desc' }, include: pageInclude }),
      prisma.landingPage.count({ where }),
    ]);
    return { items, meta: buildMeta(params.page, params.limit, total) };
  },

  async getPage(id: string) {
    const page = await prisma.landingPage.findFirst({ where: { id, deletedAt: null }, include: pageInclude });
    if (!page) throw AppError.notFound('Landing page not found');
    return page;
  },

  createPage(userId: string, officeId: string | null, input: Record<string, unknown>) {
    return prisma.landingPage.create({
      data: {
        ...(input as object),
        officeId,
        createdById: userId,
        seoMeta: (input.seoMeta ?? undefined) as Prisma.InputJsonValue,
        themeConfig: (input.themeConfig ?? undefined) as Prisma.InputJsonValue,
      } as Prisma.LandingPageUncheckedCreateInput,
      include: pageInclude,
    });
  },

  async updatePage(id: string, input: Record<string, unknown>) {
    await this.getPage(id);
    const statusChange =
      input.status === 'PUBLISHED' ? { publishedAt: new Date() } : {};
    return prisma.landingPage.update({
      where: { id },
      data: {
        ...(input as object),
        ...statusChange,
        seoMeta: input.seoMeta === undefined ? undefined : (input.seoMeta as Prisma.InputJsonValue),
        themeConfig: input.themeConfig === undefined ? undefined : (input.themeConfig as Prisma.InputJsonValue),
      } as Prisma.LandingPageUncheckedUpdateInput,
      include: pageInclude,
    });
  },

  async deletePage(id: string) {
    await this.getPage(id);
    return prisma.landingPage.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
  },

  // ── Forms ──────────────────────────────────────────
  async createForm(landingPageId: string, input: { formTitle: string; fieldsSchema: unknown; submitButtonText?: string }) {
    await this.getPage(landingPageId);
    return prisma.customLeadForm.create({
      data: {
        landingPageId,
        formTitle: input.formTitle,
        fieldsSchema: input.fieldsSchema as Prisma.InputJsonValue,
        submitButtonText: input.submitButtonText,
      },
    });
  },

  async updateForm(formId: string, input: { formTitle?: string; fieldsSchema?: unknown; submitButtonText?: string; isActive?: boolean }) {
    const form = await prisma.customLeadForm.findUnique({ where: { id: formId } });
    if (!form) throw AppError.notFound('Form not found');
    return prisma.customLeadForm.update({
      where: { id: formId },
      data: {
        formTitle: input.formTitle,
        submitButtonText: input.submitButtonText,
        isActive: input.isActive,
        ...(input.fieldsSchema !== undefined
          ? {
              fieldsSchema: input.fieldsSchema as Prisma.InputJsonValue,
              // Schema change ⇒ new version; historic submissions keep the version they saw.
              version: { increment: 1 },
            }
          : {}),
      },
    });
  },

  // ── Public delivery ────────────────────────────────
  async publicPage(slug: string) {
    const page = await prisma.landingPage.findFirst({
      where: { urlSlug: slug, status: 'PUBLISHED', deletedAt: null },
      select: {
        id: true,
        title: true,
        urlSlug: true,
        heroDescription: true,
        heroImageUrl: true,
        detailedDescription: true,
        thankYouMessage: true,
        redirectUrl: true,
        seoMeta: true,
        themeConfig: true,
        forms: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true, formTitle: true, fieldsSchema: true, version: true, submitButtonText: true },
        },
      },
    });
    if (!page) throw AppError.notFound('Page not found');

    // View counter — fire and forget, never blocks delivery.
    prisma.landingPage
      .update({ where: { id: page.id }, data: { viewCount: { increment: 1 } } })
      .catch((err) => logger.warn({ err }, 'view count increment failed'));

    return page;
  },
};
