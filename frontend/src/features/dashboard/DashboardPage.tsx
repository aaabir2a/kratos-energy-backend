import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Target,
  Handshake,
  Trophy,
  CheckCircle2,
  Circle,
  TrendingUp,
  Megaphone,
  Share2,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { leadsApi, dealsApi, sourcesApi, usersApi, marketingApi } from '@/lib/api/endpoints';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';

const money = (v: number) => `$${v.toLocaleString()}`;

function StatCard({ label, value, sub, icon: Icon, tone }: { label: string; value: string | number; sub?: string; icon: React.ElementType; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

const PHASES = [
  { phase: 'Phase 1', name: 'Authentication, RBAC & Offices', done: true },
  { phase: 'Phase 2', name: 'Leads, Pipeline & Round-robin Assignment', done: true },
  { phase: 'Phase 3', name: 'Source Tracking, Attribution & Intake', done: true },
  { phase: 'Phase 4', name: 'Deals — Convert & Close Won/Lost', done: true },
  { phase: 'Phase 5', name: 'Landing Pages & Dynamic Forms', done: true },
  { phase: 'Phase 6', name: 'Catalog & Public Website API', done: true },
  { phase: 'Phase 7', name: 'Notifications (Email / SMS / In-app)', done: false },
  { phase: 'Phase 8', name: 'Analytics & Reporting', done: false },
  { phase: 'Phase 9', name: 'Production Hardening', done: false },
];

export function DashboardPage() {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const leadStats = useQuery({ queryKey: ['leads', 'stats'], queryFn: () => leadsApi.stats(), enabled: can('leads.read') });
  const dealStats = useQuery({ queryKey: ['deals', 'stats'], queryFn: () => dealsApi.stats(), enabled: can('deals.read') });
  const sources = useQuery({
    queryKey: ['sources', 'attribution', ''],
    queryFn: () => sourcesApi.attribution(),
    enabled: can('sources.read') || can('analytics.read'),
  });
  const users = useQuery({
    queryKey: ['users', 'count'],
    queryFn: () => usersApi.list({ limit: 1 }),
    enabled: can('users.read'),
  });
  const pages = useQuery({
    queryKey: ['landing-pages'],
    queryFn: () => marketingApi.listPages({ limit: 50 }),
    enabled: can('landing_pages.read'),
  });

  const conversionRate =
    leadStats.data && leadStats.data.total > 0
      ? Math.round((leadStats.data.converted / leadStats.data.total) * 100)
      : null;
  const topSource = sources.data?.[0];
  const publishedPages = pages.data?.data.filter((p) => p.status === 'PUBLISHED').length;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user?.firstName}. Here's how lead capture and sales are tracking.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {can('leads.read') && (
          <StatCard
            label="Open leads"
            value={leadStats.data?.open ?? '—'}
            sub={leadStats.data ? `${leadStats.data.total} total captured` : undefined}
            icon={Target}
            tone="bg-primary/10 text-primary"
          />
        )}
        {can('deals.read') && (
          <StatCard
            label="Pipeline value"
            value={dealStats.data ? money(dealStats.data.openValue) : '—'}
            sub={dealStats.data ? `${dealStats.data.open} open deals` : undefined}
            icon={TrendingUp}
            tone="bg-blue-500/10 text-blue-500"
          />
        )}
        {can('deals.read') && (
          <StatCard
            label="Won this month"
            value={dealStats.data ? money(dealStats.data.wonValueMtd) : '—'}
            sub={dealStats.data ? `${dealStats.data.winRateMtd}% win rate` : undefined}
            icon={Trophy}
            tone="bg-emerald-500/10 text-emerald-500"
          />
        )}
        {can('leads.read') ? (
          <StatCard
            label="Lead conversion"
            value={conversionRate !== null ? `${conversionRate}%` : '—'}
            sub={topSource ? `Top source: ${topSource.sourceName}` : undefined}
            icon={Handshake}
            tone="bg-amber-500/10 text-amber-500"
          />
        ) : (
          can('users.read') && (
            <StatCard label="Staff users" value={users.data?.meta?.total ?? '—'} icon={Users} tone="bg-primary/10 text-primary" />
          )
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Sources snapshot */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Leads by source</CardTitle>
            {(can('sources.read') || can('analytics.read')) && (
              <Button variant="ghost" size="sm" onClick={() => navigate('/sources')}>
                Full report <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {sources.data?.length ? (
              sources.data.slice(0, 6).map((s) => {
                const max = Math.max(1, ...(sources.data ?? []).map((r) => r.total));
                return (
                  <div key={s.sourceId ?? 'unknown'}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <Share2 className="h-3.5 w-3.5 text-muted-foreground" /> {s.sourceName}
                      </span>
                      <span className="text-muted-foreground">
                        {s.total} · {s.conversionRate}% converted
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-[#6abf2e]" style={{ width: `${(s.total / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No lead data yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Quick links + website */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-muted-foreground" /> Marketing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{publishedPages ?? '—'}</span> landing page(s) live
              </p>
              <p className="text-muted-foreground">
                Catalog feeds{' '}
                <a href="https://www.kratos-energy.com/" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                  kratos-energy.com
                </a>{' '}
                via the public API.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Build roadmap</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {PHASES.map((p) => (
                <div key={p.phase} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                  {p.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#6abf2e]" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                  <p className="flex-1 truncate text-xs font-medium">{p.name}</p>
                  {p.done ? (
                    <Badge variant="success" className="text-[10px]">Done</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Planned</Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
