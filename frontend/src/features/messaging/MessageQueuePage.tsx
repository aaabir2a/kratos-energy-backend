import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Clock, Pause, Play, Send, Ban, AlertTriangle, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { messagingApi, type MessageStatus } from './api/messagingApi';
import { MessageStatusBadge, relativeTime, formatDateTime, recipientOf } from './messagingHelpers';

export function MessageQueuePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canSend = can('messaging.send');
  const canConfigure = can('settings.write');

  const [status, setStatus] = useState<MessageStatus | ''>('');
  const [search, setSearch] = useState('');

  // The queue moves on its own, so it refreshes without the user asking.
  const summary = useQuery({
    queryKey: ['messaging', 'queue', 'summary'],
    queryFn: () => messagingApi.queueSummary(),
    refetchInterval: 30_000,
  });

  const queue = useQuery({
    queryKey: ['messaging', 'queue', { status, search }],
    queryFn: () =>
      messagingApi.listQueue({
        limit: 50,
        ...(status ? { status } : { dueOnly: 'true' as const }),
        ...(search ? { search } : {}),
      }),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['messaging', 'queue'] });

  const pause = useMutation({
    mutationFn: (paused: boolean) => messagingApi.updateSettings({ sendingPaused: paused }),
    onSuccess: (s) => {
      toast.success(s.sendingPaused ? 'Sending paused — nothing will go out' : 'Sending resumed');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const runNow = useMutation({
    mutationFn: () => messagingApi.runNow(),
    onSuccess: (r) => {
      if (r.paused) toast.warning('Sending is paused — resume it first');
      else if (r.throttled) toast.warning('Hourly send limit reached — the queue will resume next hour');
      else if (r.claimed === 0) toast.info('Nothing due right now');
      else toast.success(`${r.sent} sent, ${r.failed} failed, ${r.skipped} skipped`);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => messagingApi.cancelMessage(id),
    onSuccess: () => {
      toast.success('Message cancelled');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const paused = summary.data?.sendingPaused ?? false;
  const rows = queue.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Send queue"
        description="Everything waiting to go out, and what has just been through."
      />

      {paused && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <Pause className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="flex-1 text-sm">
            <span className="font-medium">Sending is paused.</span> Messages keep queueing and nothing is
            lost — they will go out when you resume.
          </p>
          {canConfigure && (
            <Button size="sm" onClick={() => pause.mutate(false)} disabled={pause.isPending}>
              <Play className="h-4 w-4" /> Resume
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Due now"
          value={summary.data?.dueNow ?? '—'}
          sub={
            summary.data?.nextScheduledFor
              ? `Next ${relativeTime(summary.data.nextScheduledFor)}`
              : 'Nothing scheduled'
          }
          icon={Clock}
          tone="bg-primary/10 text-primary"
        />
        <StatTile
          label="Queued"
          value={summary.data?.counts.pending ?? '—'}
          sub={`${summary.data?.counts.sending ?? 0} sending`}
          icon={Inbox}
          tone="bg-blue-500/10 text-blue-500"
        />
        <StatTile
          label="Sent this hour"
          value={summary.data ? `${summary.data.sentLastHour} / ${summary.data.throttlePerHour}` : '—'}
          sub="Hourly limit"
          icon={Send}
          tone="bg-emerald-500/10 text-emerald-500"
        />
        <StatTile
          label="Failed"
          value={summary.data?.counts.failed ?? '—'}
          sub={`${summary.data?.counts.skipped ?? 0} skipped`}
          icon={AlertTriangle}
          tone={
            (summary.data?.counts.failed ?? 0) > 0
              ? 'bg-destructive/10 text-destructive'
              : 'bg-muted text-muted-foreground'
          }
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search recipient or subject…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as MessageStatus | '')}
          className="w-auto min-w-[150px]"
        >
          <option value="">Due &amp; sending</option>
          <option value="PENDING">Queued</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="SKIPPED">Skipped</option>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {canSend && (
            <Button variant="outline" size="sm" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
              <Send className="h-4 w-4" /> Send due now
            </Button>
          )}
          {canConfigure && !paused && (
            <Button variant="outline" size="sm" onClick={() => pause.mutate(true)} disabled={pause.isPending}>
              <Pause className="h-4 w-4" /> Pause sending
            </Button>
          )}
        </div>
      </div>

      <Card className="mt-4">
        {queue.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {status ? 'No messages with this status.' : 'Nothing is waiting to go out.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <p className="font-medium">{recipientOf(m)}</p>
                    {m.lead && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-primary hover:underline"
                        onClick={() => navigate(`/leads/${m.lead!.id}`)}
                      >
                        {m.lead.firstName} {m.lead.lastName}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate text-sm">{m.subject ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.template?.name ?? '—'}</TableCell>
                  <TableCell>
                    <MessageStatusBadge status={m.status} />
                    {m.attempts > 1 && (
                      <span className="ml-2 text-xs text-muted-foreground">{m.attempts} attempts</span>
                    )}
                    {(m.lastError || m.skipReason) && (
                      <p className="mt-0.5 max-w-[240px] truncate text-xs text-destructive">
                        {m.lastError ?? m.skipReason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className={cn(new Date(m.scheduledFor) <= new Date() && m.status === 'PENDING' && 'font-medium text-primary')}>
                      {relativeTime(m.scheduledFor)}
                    </span>
                    <p className="text-xs text-muted-foreground">{formatDateTime(m.scheduledFor)}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    {canSend && m.status === 'PENDING' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancel.mutate(m.id)}
                        disabled={cancel.isPending}
                      >
                        <Ban className="h-4 w-4" /> Cancel
                      </Button>
                    )}
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

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
