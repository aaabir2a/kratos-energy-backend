import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Ban, SkipForward, Send, Workflow, MessageSquareReply } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { followUpsApi, dealFollowUpsApi, type EnrolmentStatus } from './api/messagingApi';
import { MessageStatusBadge, relativeTime, formatDateTime } from './messagingHelpers';

const ENROLMENT_BADGE: Record<EnrolmentStatus, { label: string; variant: 'default' | 'success' | 'secondary' | 'warning' }> = {
  ACTIVE: { label: 'Running', variant: 'default' },
  HELD: { label: 'Paused', variant: 'warning' },
  COMPLETED: { label: 'Finished', variant: 'success' },
  CANCELLED: { label: 'Stopped', variant: 'secondary' },
};

/**
 * What automated follow-up this lead is in, what has gone out and what is next.
 * Sits on the lead detail page so a rep never has to wonder what the CRM has
 * already said to their customer.
 */
export function LeadFollowUpsCard({ leadId, dealId }: { leadId?: string; dealId?: string }) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canSend = can('messaging.send');

  const followUps = useQuery({
    queryKey: ['messaging', 'follow-ups', dealId ?? leadId],
    // On a deal, show only that deal's follow-up — a customer with two quotes
    // should not see both chases under one of them.
    queryFn: () => (dealId ? dealFollowUpsApi.forDeal(dealId) : followUpsApi.forLead(leadId!)),
    enabled: Boolean(dealId ?? leadId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['messaging', 'follow-ups', dealId ?? leadId] });
    qc.invalidateQueries({ queryKey: ['leads', leadId] });
  };

  // Named as a hook so the rules-of-hooks lint understands the useMutation
  // inside; every call below runs unconditionally, in a stable order.
  const useAction = <T,>(fn: (arg: T) => Promise<unknown>, message: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast.success(message);
        invalidate();
      },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });

  const pause = useAction(followUpsApi.pause, 'Follow-up paused');
  const resume = useAction(followUpsApi.resume, 'Follow-up resumed');
  const cancel = useAction(followUpsApi.cancel, 'Follow-up stopped');
  const skip = useAction(followUpsApi.skip, 'Step skipped');
  const sendNow = useAction(followUpsApi.sendNow, 'Step moved to the front of the queue');
  const replied = useAction(followUpsApi.markReplied, 'Follow-up stopped — customer replied');

  if (followUps.isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;

  const enrolments = followUps.data ?? [];
  const running = enrolments.filter((e) => e.status === 'ACTIVE' || e.status === 'HELD');

  if (!enrolments.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Workflow className="h-4 w-4 text-muted-foreground" /> Follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {dealId ? 'This deal is not in any automated follow-up.' : 'This lead is not in any automated follow-up.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Workflow className="h-4 w-4 text-muted-foreground" /> Follow-ups
        </CardTitle>
        {canSend && running.length > 0 && leadId && (
          <Button variant="outline" size="sm" onClick={() => replied.mutate(leadId)} disabled={replied.isPending}>
            <MessageSquareReply className="h-4 w-4" /> Customer replied
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {enrolments.map((enrolment) => {
          const badge = ENROLMENT_BADGE[enrolment.status];
          const isRunning = enrolment.status === 'ACTIVE' || enrolment.status === 'HELD';
          return (
            <div key={enrolment.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{enrolment.sequence.name}</span>
                <Badge variant={badge.variant} className="text-[10px]">
                  {badge.label}
                </Badge>
                {enrolment.cancelReason && (
                  <span className="text-xs text-muted-foreground">— {enrolment.cancelReason}</span>
                )}

                {canSend && isRunning && (
                  <span className="ml-auto flex items-center gap-1">
                    {enrolment.status === 'ACTIVE' ? (
                      <Button variant="ghost" size="sm" onClick={() => pause.mutate(enrolment.id)}>
                        <Pause className="h-3.5 w-3.5" /> Pause
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => resume.mutate(enrolment.id)}>
                        <Play className="h-3.5 w-3.5" /> Resume
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => cancel.mutate(enrolment.id)}>
                      <Ban className="h-3.5 w-3.5" /> Stop
                    </Button>
                  </span>
                )}
              </div>

              <ol className="space-y-1.5">
                {enrolment.messages.map((message) => (
                  <li
                    key={message.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {(message.step?.position ?? 0) + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{message.subject ?? 'Follow-up message'}</span>
                    <MessageStatusBadge status={message.status} />
                    <span className="text-xs text-muted-foreground" title={formatDateTime(message.scheduledFor)}>
                      {message.sentAt ? formatDateTime(message.sentAt) : relativeTime(message.scheduledFor)}
                    </span>

                    {canSend && message.status === 'PENDING' && (
                      <span className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" title="Send now" onClick={() => sendNow.mutate(message.id)}>
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Skip this step" onClick={() => skip.mutate(message.id)}>
                          <SkipForward className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    )}

                    {(message.skipReason || message.lastError) && (
                      <span className="w-full text-xs text-muted-foreground">
                        {message.skipReason ?? message.lastError}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
