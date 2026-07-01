import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';

const SAFE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  office: { select: { id: true, name: true } },
  role: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.UserSelect;

export const usersRepository = {
  list(where: Prisma.UserWhereInput, skip: number, take: number) {
    return prisma.$transaction([
      prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, select: SAFE_SELECT }),
      prisma.user.count({ where }),
    ]);
  },

  findById(id: string) {
    return prisma.user.findFirst({ where: { id, deletedAt: null }, select: SAFE_SELECT });
  },

  existsByEmail(email: string) {
    return prisma.user.findFirst({ where: { email: email.toLowerCase() }, select: { id: true } });
  },

  create(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data, select: SAFE_SELECT });
  },

  update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data, select: SAFE_SELECT });
  },

  softDelete(id: string) {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
      select: { id: true },
    });
  },
};
