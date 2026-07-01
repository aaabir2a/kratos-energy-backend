import { prisma } from '../../core/database/prisma';

export const rolesRepository = {
  listRoles() {
    return prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
  },

  findRole(id: string) {
    return prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
  },

  listPermissions() {
    return prisma.permission.findMany({ orderBy: [{ resource: 'asc' }, { action: 'asc' }] });
  },

  findPermissionsBySlugs(slugs: string[]) {
    return prisma.permission.findMany({ where: { slug: { in: slugs } } });
  },

  async setRolePermissions(roleId: string, permissionIds: string[]) {
    return prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
          skipDuplicates: true,
        });
      }
      return tx.role.findUnique({
        where: { id: roleId },
        include: { permissions: { include: { permission: true } } },
      });
    });
  },
};
