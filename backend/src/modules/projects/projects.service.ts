import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { AppError } from '../../shared/errors/AppError';
import { buildMeta } from '../../shared/utils/pagination';
import type { CreateProjectInput, UpdateProjectInput } from './projects.schema';

// '' | null => clear the column; undefined => leave unchanged.
function nullable(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  return v === '' || v === null ? null : v;
}

function dateValue(v: string | null | undefined): Date | null | undefined {
  const cleaned = nullable(v);
  if (cleaned === undefined) return undefined;
  return cleaned === null ? null : new Date(cleaned);
}

// Newest projects first, but respect an explicit sortOrder when set.
const ORDER: Prisma.ProjectOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { projectDate: 'desc' },
  { createdAt: 'desc' },
];

export const projectsService = {
  async list(params: { page: number; limit: number; skip: number; search?: string; published?: boolean }) {
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      ...(params.published === undefined ? {} : { isPublished: params.published }),
      ...(params.search
        ? {
            OR: [
              { title: { contains: params.search, mode: 'insensitive' } },
              { location: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.project.findMany({ where, orderBy: ORDER, skip: params.skip, take: params.limit }),
      prisma.project.count({ where }),
    ]);
    return { items, meta: buildMeta(params.page, params.limit, total) };
  },

  async get(id: string) {
    const project = await prisma.project.findFirst({ where: { id, deletedAt: null } });
    if (!project) throw AppError.notFound('Project not found');
    return project;
  },

  create(userId: string | undefined, input: CreateProjectInput) {
    return prisma.project.create({
      data: {
        title: input.title,
        description: input.description,
        images: input.images ?? [],
        location: input.location,
        projectDate: input.projectDate ? new Date(input.projectDate) : undefined,
        isPublished: input.isPublished ?? true,
        sortOrder: input.sortOrder ?? 0,
        createdById: userId,
      },
    });
  },

  async update(id: string, input: UpdateProjectInput) {
    await this.get(id);
    return prisma.project.update({
      where: { id },
      data: {
        title: input.title,
        description: nullable(input.description),
        images: input.images, // undefined leaves the array untouched
        location: nullable(input.location),
        projectDate: dateValue(input.projectDate),
        isPublished: input.isPublished,
        sortOrder: input.sortOrder,
      },
    });
  },

  async remove(id: string) {
    await this.get(id);
    return prisma.project.update({
      where: { id },
      data: { deletedAt: new Date(), isPublished: false },
      select: { id: true },
    });
  },

  // ── Public delivery (no auth) ──────────────────────
  async publicList(params: { page: number; limit: number; skip: number }) {
    const where: Prisma.ProjectWhereInput = { deletedAt: null, isPublished: true };
    const [items, total] = await prisma.$transaction([
      prisma.project.findMany({
        where,
        orderBy: ORDER,
        skip: params.skip,
        take: params.limit,
        select: {
          id: true,
          title: true,
          description: true,
          images: true,
          location: true,
          projectDate: true,
          createdAt: true,
        },
      }),
      prisma.project.count({ where }),
    ]);
    return { items, meta: buildMeta(params.page, params.limit, total) };
  },

  async publicGet(id: string) {
    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null, isPublished: true },
      select: {
        id: true,
        title: true,
        description: true,
        images: true,
        location: true,
        projectDate: true,
        createdAt: true,
      },
    });
    if (!project) throw AppError.notFound('Project not found');
    return project;
  },
};
