import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';

export const officesRepository = {
  list(where: Prisma.OfficeWhereInput, skip: number, take: number) {
    return prisma.$transaction([
      prisma.office.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.office.count({ where }),
    ]);
  },

  findById(id: string) {
    return prisma.office.findFirst({ where: { id, deletedAt: null } });
  },

  create(data: Prisma.OfficeCreateInput) {
    return prisma.office.create({ data });
  },

  update(id: string, data: Prisma.OfficeUpdateInput) {
    return prisma.office.update({ where: { id }, data });
  },

  softDelete(id: string) {
    return prisma.office.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  },
};
