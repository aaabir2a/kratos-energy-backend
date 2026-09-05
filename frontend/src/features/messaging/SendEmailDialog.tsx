import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Send, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiErrorMessage } from '@/lib/api/client';
import { templatesApi, sendApi, type SendFilters } from './api/messagingApi';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Explicit selection. Takes precedence over filters. */
  leadIds?: string[];
  /** "Everyone matching the current view" — resolved server-side. */
  filters?: SendFilters;
  onSent?: () => void;
}

/**
 * Pick a template, see it rendered for a real recipient, then confirm.
 *
 * A bulk send is the one action here that cannot be taken back, so the confirm
 * step states plainly who is included and who was dropped before the button
 * becomes available.
 */
export function SendEmailDialog({ open, onOpenChange, leadIds, filters, onSent }: Props) {
  const [templateId, setTemplateId] = useState('');
  const [schedule, setSchedule] = useState<'now' | 'later'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [confirming, setConfirming] = useState(false);

  const templates = useQuery({
    queryKey: ['messaging', 'templates', 'active'],
    queryFn: () => templatesApi.list({ limit: 100, isActive: 'true' }),
    enabled: open,
  });

  const preview = useMutation({
    mutationFn: () => sendApi.preview({ templateId, leadIds, filters }),
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const send = useMutation({
    mutationFn: () =>
      sendApi.send({
        templateId,
        leadIds,
        filters,
        ...(schedule === 'later' && scheduledFor
          ? { scheduledFor: new Date(scheduledFor).toISOString() }
          : {}),
      }),
    onSuccess: (r) => {
      toast.success(
        `${r.queued} message${r.queued === 1 ? '' : 's'} queued — track them on the send queue`,
      );
      onSent?.();
      close();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const close = () => {
    setTemplateId('');
    setConfirming(false);
    setSchedule('now');
    setScheduledFor('');
    preview.reset();
    onOpenChange(false);
  };

  // Re-check the audience whenever the template changes: an archived template
  // or a changed selection should surface before anyone hits send.
  useEffect(() => {
    if (open && templateId) preview.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, open]);

  const p = preview.data;
  const capExceeded = p?.cap != null && p.screening.willSend > p.cap;
  const nobody = p != null && p.screening.willSend === 0;
  const canSend = Boolean(templateId) && p != null && !capExceeded && !nobody;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            {leadIds?.length
              ? `${leadIds.length} lead${leadIds.length === 1 ? '' : 's'} selected.`
              : 'Everyone matching your current filters.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="template">Template</Label>
            <Select id="template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Choose a template…</option>
              {templates.data?.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>

          {preview.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking who can receive this…
            </p>
          )}

          {p && (
            <>
              <div className="rounded-lg border p-4">
                <p className="text-sm">
                  <span className="text-2xl font-semibold tabular-nums">{p.screening.willSend}</span>{' '}
                  <span className="text-muted-foreground">
                    will receive this
                    {p.screening.total !== p.screening.willSend && ` of ${p.screening.total} selected`}
                  </span>
                </p>
                {(p.screening.skipped.noAddress > 0 || p.screening.skipped.unsubscribed > 0) && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Skipped:{' '}
                    {[
                      p.screening.skipped.unsubscribed > 0 &&
                        `${p.screening.skipped.unsubscribed} unsubscribed`,
                      p.screening.skipped.noAddress > 0 &&
                        `${p.screening.skipped.noAddress} with no email address`,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
              </div>

              {capExceeded && (
                <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  You can send to at most {p.cap} leads at once. Narrow the selection, or ask a manager to
                  send it.
                </p>
              )}

              {nobody && !capExceeded && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Nobody in this selection can be emailed.
                </p>
              )}

              {p.sample && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    As <span className="font-medium text-foreground">{p.sample.leadName}</span> ({p.sample.to})
                    will see it:
                  </p>
                  <div className="max-h-56 overflow-y-auto rounded-lg border bg-white p-4 text-sm text-slate-800">
                    <p className="mb-2 font-medium">{p.sample.subject}</p>
                    <div dangerouslySetInnerHTML={{ __html: p.sample.bodyHtml }} />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>When</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value as 'now' | 'later')}
                    className="w-auto"
                  >
                    <option value="now">As soon as sending is allowed</option>
                    <option value="later">At a specific time</option>
                  </Select>
                  {schedule === 'later' && (
                    <Input
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      className="w-auto"
                    />
                  )}
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> Quiet hours still apply — anything falling outside them waits
                  for the next opening.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {!confirming ? (
            <Button disabled={!canSend} onClick={() => setConfirming(true)}>
              <Send className="h-4 w-4" /> Review &amp; send
            </Button>
          ) : (
            <Button disabled={!canSend || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send to {p?.screening.willSend}{' '}
              <Badge variant="secondary" className="ml-1 text-[10px]">
                cannot be undone
              </Badge>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
