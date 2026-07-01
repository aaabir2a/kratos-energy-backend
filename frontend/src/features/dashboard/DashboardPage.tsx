import { useQuery } from '@tanstack/react-query';
import { Users, Building2, ShieldCheck, Target, Handshake, Megaphone, CheckCircle2, Circle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/PageHeader';
import { usersApi, officesApi, rolesApi } from '@/lib/api/endpoints';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores/auth.store';

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

const PHASES = [
  { phase: 'Phase 1', name: 'Authentication, RBAC & Offices', done: true },
  { phase: 'Phase 2', name: 'Leads & Assignment', done: false },
  { phase: 'Phase 3', name: 'Source Tracking & Intake', done: false },
  { phase: 'Phase 4', name: 'Pipeline, Deals & Close', done: false },
  { phase: 'Phase 5', name: 'Landing Pages & Forms', done: false },
  { phase: 'Phase 6', name: 'Catalog (Products + Packages)', done: false },
];

export function DashboardPage() {
  const { can } = usePermissions();
  const user = useAuthStore((s) => s.user);

  const users = useQuery({
    queryKey: ['users', 'count'],
    queryFn: () => usersApi.list({ limit: 1 }),
    enabled: can('users.read'),
  });
  const offices = useQuery({
    queryKey: ['offices', 'count'],
    queryFn: () => officesApi.list({ limit: 1 }),
    enabled: can('offices.read'),
  });
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => rolesApi.list(),
    enabled: can('roles.read'),
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Signed in as ${user?.role.name}. Phase 1 foundation is live.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {can('users.read') && (
          <StatCard label="Staff users" value={users.data?.meta?.total ?? '—'} icon={Users} />
        )}
        {can('offices.read') && (
          <StatCard label="Offices" value={offices.data?.meta?.total ?? '—'} icon={Building2} />
        )}
        {can('roles.read') && <StatCard label="Roles" value={roles.data?.length ?? '—'} icon={ShieldCheck} />}
        <StatCard label="Leads (Phase 2)" value="—" icon={Target} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Build roadmap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {PHASES.map((p) => (
              <div key={p.phase} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
                {p.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.phase}</p>
                </div>
                {p.done ? <Badge variant="success">Done</Badge> : <Badge variant="secondary">Planned</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coming next</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Target className="mt-0.5 h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Lead capture from website, social & chatbot</span>
            </div>
            <div className="flex items-start gap-3">
              <Handshake className="mt-0.5 h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Convert leads to deals and close won/lost</span>
            </div>
            <div className="flex items-start gap-3">
              <Megaphone className="mt-0.5 h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Landing-page builder with dynamic forms</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
