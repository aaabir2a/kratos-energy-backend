import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Users2, Megaphone, MailX, Send, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/utils';
import { analyticsApi } from './api/marketingApi';
import { TrendChart } from './TrendChart';

/** The section's landing page: what is here, and how it is doing. */
export function EmailOverviewPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();

  const overview = useQuery({
    queryKey: ['marketing', 'analytics', 'overview'],
    queryFn: () => analyticsApi.overview(30),
  });

  if (overview.isLoading) return <Skeleton className="h-[600px] w-full rounded-xl" />;
  const o = overview.data;
  if (!o) return <p className="text-sm text-muted-foreground">Nothing to show yet.</p>;

  return (
    <div>
      <PageHeader
        title="Email marketing"
        description={`Contacts, campaigns and how the last ${o.windowDays} days went.`}
        action={
          can('marketing_email.write') ? (
            <Button onClick={() => navigate('/email/campaigns')}>
              <Megaphone className="h-4 w-4" /> Campaigns
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat to="/email/contacts" icon={Users2} label="Contacts" value={o.contacts} note={`across ${o.lists} list${o.lists === 1 ? '' : 's'}`} />
        <Stat to="/email/campaigns" icon={Megaphone} label="Campaigns" value={o.campaigns} note="all time" />
        <Stat icon={Send} label={`Sent in ${o.windowDays} days`} value={o.totals.sent} note={`${o.totals.opened} opened`} />
        <Stat
          icon={MailX}
          label="Unsubscribed"
          value={o.suppressed}
          note="cannot be emailed"
          warn={o.suppressed > 0}
        />
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Last {o.windowDays} days</CardTitle>
          <CardDescription>
            {o.totals.sent > 0
              ? `${o.totals.rates.openRate}% opened, ${o.totals.rates.clickRate}% clicked.`
              : 'Nothing has been sent in this period.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrendChart data={o.series} />
        </CardContent>
      </Card>

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Recent campaigns</h2>
        <Link to="/email/analytics" className="flex items-center gap-1 text-xs text-primary underline">
          All analytics <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-3 space-y-2">
        {!o.recent.length ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No campaign has been sent yet.
            </CardContent>
          </Card>
        ) : (
          o.recent.map((c) => (
            <Card key={c.id} className="transition-colors hover:border-primary/50">
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate(`/email/campaigns/${c.id}`)}
                >
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.startedAt ? formatDate(c.startedAt) : 'Not sent'}
                    {c.templateName && ` · ${c.templateName}`}
                  </p>
                </button>
                <div className="flex items-center gap-4 text-sm">
                  <span className="tabular-nums">
                    <span className="font-semibold">{c.stats.sent}</span>
                    <span className="ml-1 text-xs text-muted-foreground">sent</span>
                  </span>
                  <Badge variant="secondary" className="tabular-nums text-[10px]">
                    {c.stats.rates.openRate}% opened
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({
  to,
  icon: Icon,
  label,
  value,
  note,
  warn,
}: {
  to?: string;
  icon: React.ElementType;
  label: string;
  value: number;
  note: string;
  warn?: boolean;
}) {
  const body = (
    <CardContent className="flex items-start justify-between p-5">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={
            warn
              ? 'mt-1 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400'
              : 'mt-1 text-2xl font-semibold tabular-nums'
          }
        >
          {value}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
      </div>
      <Icon className="h-5 w-5 text-muted-foreground" />
    </CardContent>
  );

  return to ? (
    <Link to={to}>
      <Card className="h-full transition-colors hover:border-primary/50">{body}</Card>
    </Link>
  ) : (
    <Card>{body}</Card>
  );
}
