import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { usePermissions } from '@/hooks/usePermissions';

export function RequireAuth() {
  const token = useAuthStore((s) => s.accessToken);
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

export function RequirePermission({ perm }: { perm: string }) {
  const { can } = usePermissions();
  if (!can(perm)) return <Navigate to="/403" replace />;
  return <Outlet />;
}
