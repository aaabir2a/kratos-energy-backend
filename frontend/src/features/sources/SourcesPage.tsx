import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe, Share2, Bot, UserPlus, PenLine, HelpCircle, Megaphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/PageHeader';
import { sourcesApi, campaignsApi } from '@/lib/api/endpoints';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';

const TYPE_ICON: Record<string, React.ElementType> = {
  website: Globe,
  social: Share2,
  chatbot: Bot,
  referral: UserPlus,
  manual: PenLine,
  other: HelpCircle,
};

export function SourcesPage() {
  const { can } = usePermissions();
  const [days, setDays] = useState('');

  const report = useQuery({
    queryKey: ['sources', 'attribution', days],
    queryFn: () => sourcesApi.attribution(days ? Number(days) : undefined),
  });
  const campaigns = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.list(),
    enabled: can('campaigns.read') || can('analytics.read'),
  });

  const rows = report.data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <div>
      <PageHeader
        title="Lead Sources"
        description="Where your leads come from, and which channels convert."
        action={
          <Select value={days} onChange={(e) => setDays(e.target.value)} className="w-auto min-w-[150px]">
            <option value="">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Volume bars */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Leads by source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : !rows.length ? (
              <p className="text-sm text-muted-foreground">No leads captured yet.</p>
            ) : (
              rows.map((r) => {
                const Icon = TYPE_ICON[r.sourceType] ?? HelpCircle;
                return (
                  <div key={r.sourceId ?? 'unknown'}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {r.sourceName}
                      </span>
                      <span className="text-muted-foreground">{r.total}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${(r.total / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Conversion table */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Source performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {report.isLoading ? (
              <Skeleton className="m-4 h-48 w-auto" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Converted</TableHead>
                    <TableHead className="text-right">Lost</TableHead>
                    <TableHead className="text-right">Conversion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.sourceId ?? 'unknown'}>
                      <TableCell className="font-medium">{r.sourceName}</TableCell>
                      <TableCell className="text-right">{r.total}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.open}</TableCell>
                      <TableCell className="text-right text-emerald-600 dark:text-emerald-400">{r.converted}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.lost}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            'font-medium',
                            r.conversionRate >= 20
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : r.conversionRate > 0
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-muted-foreground',
                          )}
                        >
                          {r.conversionRate}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Campaigns */}
      {campaigns.data && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" /> Campaign performance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!campaigns.data.length ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                No campaigns yet. Create one via the API (`POST /campaigns`) with a `utmCampaign` matching your ad URLs —
                incoming leads attribute automatically.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>UTM</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Cost / lead</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.data.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.channel ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{c.utmCampaign ?? '—'}</TableCell>
                      <TableCell className="text-right">{c.leads}</TableCell>
                      <TableCell className="text-right">{c.spend ? `$${c.spend.toLocaleString()}` : '—'}</TableCell>
                      <TableCell className="text-right">{c.costPerLead ? `$${c.costPerLead}` : '—'}</TableCell>
                      <TableCell>
                        {c.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Ended</Badge>}
                      </TableCell>
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
