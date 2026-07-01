import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { rolesApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import type { Permission, Role } from '@/lib/api/types';

function RoleEditor({
  role,
  permissions,
  canEdit,
}: {
  role: Role;
  permissions: Permission[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const isAdmin = role.slug === 'admin';
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissions));
  const dirty = useMemo(() => {
    const base = new Set(role.permissions);
    if (base.size !== selected.size) return true;
    for (const p of selected) if (!base.has(p)) return true;
    return false;
  }, [selected, role.permissions]);

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions) {
      const arr = map.get(p.resource) ?? [];
      arr.push(p);
      map.set(p.resource, arr);
    }
    return [...map.entries()];
  }, [permissions]);

  const save = useMutation({
    mutationFn: () => rolesApi.setPermissions(role.id, [...selected]),
    onSuccess: () => {
      toast.success(`${role.name} permissions saved`);
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  function toggle(slug: string) {
    if (!canEdit || isAdmin) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            {role.name}
            {isAdmin && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          </CardTitle>
          <CardDescription>{role.description}</CardDescription>
        </div>
        <Badge variant="secondary">{role.userCount ?? 0} users</Badge>
      </CardHeader>
      <CardContent>
        {isAdmin ? (
          <p className="text-sm text-muted-foreground">
            The Administrator role has full, immutable access to every resource.
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map(([resource, perms]) => (
              <div key={resource}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {resource.replace('_', ' ')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {perms.map((p) => {
                    const active = selected.has(p.slug);
                    return (
                      <button
                        key={p.slug}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggle(p.slug)}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'border-primary/30 bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted',
                          !canEdit && 'cursor-default opacity-80',
                        )}
                      >
                        {p.action}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {canEdit && (
              <div className="flex justify-end pt-1">
                <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RolesPage() {
  const { can } = usePermissions();
  const canEdit = can('roles.write');

  const roles = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.list() });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: () => rolesApi.permissions() });

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Control what each role can access. Changes apply on a user's next login or token refresh."
      />
      {roles.isLoading || permissions.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {roles.data?.map((role) => (
            <RoleEditor
              key={role.id}
              role={role}
              permissions={permissions.data ?? []}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
      {!canEdit && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> You have read-only access to roles.
        </p>
      )}
    </div>
  );
}
