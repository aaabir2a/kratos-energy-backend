import { AppError } from '../../shared/errors/AppError';
import { ROLE_SLUGS } from '../../shared/constants/rbac';
import { rolesRepository } from './roles.repository';

function mapRole(role: Awaited<ReturnType<typeof rolesRepository.findRole>>) {
  if (!role) return role;
  return {
    id: role.id,
    name: role.name,
    slug: role.slug,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((p) => p.permission.slug),
  };
}

export const rolesService = {
  async list() {
    const roles = await rolesRepository.listRoles();
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.slug === ROLE_SLUGS.ADMIN ? ['*.*'] : r.permissions.map((p) => p.permission.slug),
    }));
  },

  listPermissions() {
    return rolesRepository.listPermissions();
  },

  async get(id: string) {
    const role = await rolesRepository.findRole(id);
    if (!role) throw AppError.notFound('Role not found');
    return mapRole(role);
  },

  async setPermissions(id: string, slugs: string[]) {
    const role = await rolesRepository.findRole(id);
    if (!role) throw AppError.notFound('Role not found');
    if (role.slug === ROLE_SLUGS.ADMIN) {
      throw AppError.forbidden('Admin role permissions cannot be modified');
    }
    const perms = await rolesRepository.findPermissionsBySlugs(slugs);
    const updated = await rolesRepository.setRolePermissions(id, perms.map((p) => p.id));
    return mapRole(updated);
  },
};
