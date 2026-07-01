import { useAuthStore } from '@/stores/auth.store';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const perms = user?.permissions ?? [];

  const can = (required: string): boolean => {
    if (perms.includes('*.*')) return true;
    if (perms.includes(required)) return true;
    const [resource] = required.split('.');
    return perms.includes(`${resource}.*`);
  };

  const canAny = (...required: string[]) => required.some(can);

  return { can, canAny, role: user?.role.slug, permissions: perms };
}
