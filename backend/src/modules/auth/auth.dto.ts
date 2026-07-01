import { ROLE_SLUGS } from '../../shared/constants/rbac';
import type { UserWithRole } from './auth.repository';

export interface AuthUserDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: { slug: string; name: string };
  office: { id: string; name: string } | null;
  permissions: string[];
}

// Resolve the effective permission slugs for a user. Admin → wildcard.
export function resolvePermissions(user: UserWithRole): string[] {
  if (user.role.slug === ROLE_SLUGS.ADMIN) return ['*.*'];
  return user.role.permissions.map((rp) => rp.permission.slug);
}

export function toAuthUserDto(user: UserWithRole, permissions: string[]): AuthUserDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: { slug: user.role.slug, name: user.role.name },
    office: user.office ? { id: user.office.id, name: user.office.name } : null,
    permissions,
  };
}
