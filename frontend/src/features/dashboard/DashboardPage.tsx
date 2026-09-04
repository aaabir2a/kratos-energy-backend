import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Target,
  Handshake,
  Trophy,
  TrendingUp,
  Megaphone,
  Share2,
  ArrowRight,
  UserPlus,
  CalendarClock,
  Home,
  Building2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/PageHeader';
import { leadsApi, dealsApi, sourcesApi, usersApi, marketingApi } from '@/lib/api/endpoints';
import { StageBadge, fullName } from '@/features/leads/leadHelpers';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';

const money = (v: number) => `$${v.toLocaleString()}`;

/** Compact "3h ago" stamp; falls back to a date once it is more than a week old. */
function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

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

/** One row of "Needs attention". A zero count stays muted so an empty queue reads as calm. */
function AttentionRow({ label, count, icon: Icon, tone, onClick }: { label: string; count: number; icon: React.ElementType; tone: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
    >
      <Icon className={cn('h-4 w-4 shrink-0', count > 0 ? tone : 'text-muted-foreground/40')} />
      <span className="flex-1 truncate text-xs font-medium">{label}</span>
      <span className={cn('text-sm font-semibold tabular-nums', count > 0 ? tone : 'text-muted-foreground')}>{count}</span>
    </button>
  );
}

export function DashboardPage() {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const leadStats = useQuery({ queryKey: ['leads', 'stats'], queryFn: () => leadsApi.stats(), enabled: can('leads.read') });
  const dealStats = useQuery({ queryKey: ['deals', 'stats'], queryFn: () => dealsApi.stats(), enabled: can('deals.read') });
  const residentialStats = useQuery({
    queryKey: ['leads', 'stats', 'RESIDENTIAL'],
    queryFn: () => leadsApi.stats({ enquiryType: 'RESIDENTIAL' }),
    enabled: can('leads.read'),
  });
  const recentLeads = useQuery({
    queryKey: ['leads', 'recent'],
    queryFn: () => leadsApi.list({ limit: 8, sort: 'createdAt', order: 'desc' }),
    enabled: can('leads.read'),
  });
  // Snapshot of the open queue. The list API has no "unassigned" or "overdue" filter,
  // so those counts are derived here from the newest open leads — 100 is the server's cap.
  const openLeads = useQuery({
    queryKey: ['leads', 'open-snapshot'],
    queryFn: () => leadsApi.list({ status: 'OPEN', limit: 100, sort: 'createdAt', order: 'desc' }),
    enabled: can('leads.read'),
  });
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

  // enquiry_type is NOT NULL with two values, so commercial is whatever is not residential.
  const residential = residentialStats.data?.total ?? 0;
  const commercial = Math.max(0, (leadStats.data?.total ?? 0) - residential);
  const enquiryTotal = residential + commercial;

  const openSnapshot = openLeads.data?.data ?? [];
  const openTotal = openLeads.data?.meta?.total ?? openSnapshot.length;
  const snapshotPartial = openTotal > openSnapshot.length;
  const now = Date.now();
  const endOfToday = new Date().setHours(23, 59, 59, 999);
  const unassigned = openSnapshot.filter((l) => !l.assignedTo).length;
  const overdue = openSnapshot.filter((l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() < now).length;
  const dueToday = openSnapshot.filter((l) => {
    if (!l.nextFollowUpAt) return false;
    const due = new Date(l.nextFollowUpAt).getTime();
    return due >= now && due <= endOfToday;
  }).length;

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

        {/* Queue health, enquiry mix + website */}
        <div className="space-y-6">
          {can('leads.read') && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Needs attention</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate('/leads')}>
                  Leads <ArrowRight className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-1">
                <AttentionRow
                  label="Unassigned open leads"
                  count={unassigned}
                  icon={UserPlus}
                  tone="text-amber-600 dark:text-amber-400"
                  onClick={() => navigate('/leads')}
                />
                <AttentionRow
                  label="Follow-ups overdue"
                  count={overdue}
                  icon={CalendarClock}
                  tone="text-red-600 dark:text-red-400"
                  onClick={() => navigate('/leads')}
                />
                <AttentionRow
                  label="Follow-ups due today"
                  count={dueToday}
                  icon={CalendarClock}
                  tone="text-primary"
                  onClick={() => navigate('/leads')}
                />
                <p className="px-2 pt-1 text-[11px] text-muted-foreground">
                  {snapshotPartial
                    ? `From the ${openSnapshot.length} newest of ${openTotal} open leads.`
                    : `Across all ${openTotal} open lead${openTotal === 1 ? '' : 's'}.`}
                </p>
              </CardContent>
            </Card>
          )}

          {can('leads.read') && (
            <Card>
              <CardHeader>
                <CardTitle>Enquiry mix</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {enquiryTotal === 0 ? (
                  <p className="text-sm text-muted-foreground">No leads captured yet.</p>
                ) : (
                  [
                    { label: 'Residential', value: residential, icon: Home, bar: 'bg-[#6abf2e]' },
                    { label: 'Commercial', value: commercial, icon: Building2, bar: 'bg-[#175c4c]' },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 font-medium">
                          <row.icon className="h-3.5 w-3.5 text-muted-foreground" /> {row.label}
                        </span>
                        <span className="text-muted-foreground">
                          {row.value} · {Math.round((row.value / enquiryTotal) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className={cn('h-2 rounded-full', row.bar)} style={{ width: `${(row.value / enquiryTotal) * 100}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

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
        </div>
      </div>

      {can('leads.read') && (
        <Card className="mt-6">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Latest leads</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/leads')}>
              All leads <ArrowRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {!recentLeads.data?.data.length ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No leads captured yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Enquiry</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Captured</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLeads.data.data.map((l) => (
                    <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/leads/${l.id}`)}>
                      <TableCell>
                        <p className="font-medium">
                          {l.firstName} {l.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {l.email ?? l.phone ?? '—'}
                          {l.suburb && ` · ${l.suburb}${l.state ? `, ${l.state}` : ''}`}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={l.enquiryType === 'COMMERCIAL' ? 'secondary' : 'default'} className="text-[10px]">
                          {l.enquiryType === 'COMMERCIAL' ? 'Commercial' : 'Residential'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StageBadge stage={l.stage} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.source?.name ?? '—'}</TableCell>
                      <TableCell
                        className={cn('text-sm', l.assignedTo ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')}
                      >
                        {fullName(l.assignedTo)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{timeAgo(l.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
