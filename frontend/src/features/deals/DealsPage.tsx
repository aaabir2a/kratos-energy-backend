import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Handshake, Search, TrendingUp, Trophy, Percent, CircleDollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { dealsApi, pipelineApi } from '@/lib/api/endpoints';
import { initials, formatDate, cn } from '@/lib/utils';
import { StageBadge } from '@/features/leads/leadHelpers';
import type { DealStatus } from '@/lib/api/types';

const STATUS_VARIANT: Record<DealStatus, 'default' | 'success' | 'destructive'> = {
  OPEN: 'default',
  WON: 'success',
  LOST: 'destructive',
};

function money(v: string | number) {
  return `$${Number(v).toLocaleString()}`;
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: React.ElementType; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DealsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [stageId, setStageId] = useState('');

  const stats = useQuery({ queryKey: ['deals', 'stats'], queryFn: () => dealsApi.stats() });
  const stages = useQuery({ queryKey: ['pipeline', 'stages', 'DEAL'], queryFn: () => pipelineApi.stages('DEAL') });
  const deals = useQuery({
    queryKey: ['deals', { search, status, stageId }],
    queryFn: () =>
      dealsApi.list({ search: search || undefined, status: status || undefined, stageId: stageId || undefined, limit: 50 }),
  });

  const rows = deals.data?.data ?? [];

  return (
    <div>
      <PageHeader title="Deals" description="Sales created from qualified leads — work them to a close." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open deals" value={stats.data?.open ?? '—'} icon={Handshake} tone="bg-primary/10 text-primary" />
        <StatCard label="Pipeline value" value={stats.data ? money(stats.data.openValue) : '—'} icon={TrendingUp} tone="bg-blue-500/10 text-blue-500" />
        <StatCard label="Won this month" value={stats.data ? money(stats.data.wonValueMtd) : '—'} icon={Trophy} tone="bg-emerald-500/10 text-emerald-500" />
        <StatCard label="Win rate (MTD)" value={stats.data ? `${stats.data.winRateMtd}%` : '—'} icon={Percent} tone="bg-amber-500/10 text-amber-500" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search deals…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={stageId} onChange={(e) => setStageId(e.target.value)} className="w-auto min-w-[150px]">
          <option value="">All stages</option>
          {stages.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[130px]">
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="WON">Won</option>
          <option value="LOST">Lost</option>
        </Select>
      </div>

      <Card>
        {deals.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <CircleDollarSign className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No deals yet. Convert a qualified lead to create one.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deal</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Expected close</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/deals/${d.id}`)}>
                  <TableCell>
                    <p className="font-medium">
                      <span className="mr-1.5 text-xs text-muted-foreground">D-{d.dealNumber}</span>
                      {d.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.lead.firstName} {d.lead.lastName}
                      {d.lead.source && ` · via ${d.lead.source.name}`}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={d.stage} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[d.status]}>{d.status.charAt(0) + d.status.slice(1).toLowerCase()}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{money(d.value)}</TableCell>
                  <TableCell>
                    {d.owner ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px]">{initials(d.owner.firstName, d.owner.lastName)}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{d.owner.firstName}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {d.status === 'OPEN' ? (d.expectedCloseDate ? formatDate(d.expectedCloseDate) : '—') : formatDate(d.closedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
