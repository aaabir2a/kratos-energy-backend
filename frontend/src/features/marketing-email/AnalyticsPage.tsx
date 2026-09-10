import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Bot, AlertTriangle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { formatDate, cn } from '@/lib/utils';
import { analyticsApi, type CampaignAnalyticsRow } from './api/marketingApi';
import { TrendChart } from './TrendChart';

export function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const series = useQuery({
    queryKey: ['marketing', 'analytics', 'series', days],
    queryFn: () => analyticsApi.series(days),
  });
  const campaigns = useQuery({
    queryKey: ['marketing', 'analytics', 'campaigns'],
    queryFn: () => analyticsApi.campaigns(50),
  });

  const rows = campaigns.data ?? [];
  const missingDelivery = rows.some((r) => r.stats.deliveryEventsMissing);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="How campaigns performed, counting people rather than machines."
      />

      {/* Filters in one row above the charts. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-auto min-w-[150px]"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Select>
      </div>

      {missingDelivery && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            Delivered and bounced are empty because the provider webhook is not set up, so nothing reports
            what happened after we handed the message over. Rates below are over what was{' '}
            <strong>sent</strong>, which is unaffected. Add the webhook in Resend and set{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">MAIL_WEBHOOK_SECRET</code> to fill them in.
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sends and engagement</CardTitle>
          <CardDescription>One message counted once, however many times it was opened.</CardDescription>
        </CardHeader>
        <CardContent>
          {series.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <TrendChart data={series.data ?? []} />
          )}
        </CardContent>
      </Card>

      <h2 className="mb-3 mt-8 text-sm font-semibold">Campaigns</h2>

      {campaigns.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No campaign has been sent yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <CampaignRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignRow({ row }: { row: CampaignAnalyticsRow }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const s = row.stats;

  const links = useQuery({
    queryKey: ['marketing', 'analytics', 'links', row.id],
    queryFn: () => analyticsApi.links(row.id),
    enabled: open,
  });

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full flex-wrap items-center gap-4 p-4 text-left transition-colors hover:bg-muted/40"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{row.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {row.templateName ?? 'No template'}
              {row.startedAt && ` · ${formatDate(row.startedAt)}`}
            </span>
          </span>

          <Metric label="Sent" value={s.sent} />
          <Metric label="Opened" value={s.opened} rate={s.rates.openRate} />
          <Metric label="Clicked" value={s.clicked} rate={s.rates.clickRate} />
          <Metric
            label="Unsub."
            value={s.unsubscribed}
            rate={s.rates.unsubscribeRate}
            warn={s.rates.unsubscribeRate >= 1}
          />
        </button>

        {open && (
          <div className="space-y-4 border-t px-4 py-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Detail label="Recipients" value={s.recipients} />
              <Detail label="Delivered" value={s.delivered} muted={s.deliveryEventsMissing} />
              <Detail label="Bounced" value={s.bounced} muted={s.deliveryEventsMissing} />
              <Detail label="Failed" value={s.failed} />
            </div>

            {s.machineOpens > 0 && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Bot className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {s.machineOpens} further open{s.machineOpens === 1 ? ' was' : 's were'} a scanner or an image
                proxy, recorded but not counted above — they prove delivery, not readership.
              </p>
            )}

            <div>
              <p className="mb-2 text-xs font-medium">Links followed</p>
              {links.isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : !links.data?.length ? (
                <p className="text-xs text-muted-foreground">Nobody clicked a link in this campaign.</p>
              ) : (
                <ul className="space-y-1">
                  {links.data.map((l) => (
                    <li key={l.url} className="flex items-center gap-3 text-xs">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{l.url}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {l.people} {l.people === 1 ? 'person' : 'people'}
                        {l.clicks > l.people && ` · ${l.clicks} clicks`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              className="text-xs text-primary underline"
              onClick={() => navigate(`/email/campaigns/${row.id}`)}
            >
              Open this campaign
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Number first, rate second — the count is the fact, the rate is the reading. */
function Metric({
  label,
  value,
  rate,
  warn,
}: {
  label: string;
  value: number;
  rate?: number;
  warn?: boolean;
}) {
  return (
    <span className="w-20 shrink-0 text-right">
      <span className="block text-sm font-semibold tabular-nums">{value}</span>
      <span className="block text-[11px] text-muted-foreground">
        {label}
        {rate !== undefined && (
          <span className={cn('ml-1 tabular-nums', warn && 'text-amber-600 dark:text-amber-400')}>
            {rate}%
          </span>
        )}
      </span>
    </span>
  );
}

function Detail({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <p className={cn('text-lg font-semibold tabular-nums', muted && 'text-muted-foreground/50')}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">
        {label}
        {muted && <Badge variant="secondary" className="ml-1 text-[9px]">not reported</Badge>}
      </p>
    </div>
  );
}
