import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Loader2, Send, AlertTriangle, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { cn, formatDate } from '@/lib/utils';
import { messagingApi, templatesApi } from '@/features/messaging/api/messagingApi';
import { ConfirmSendDialog } from '@/features/messaging/ConfirmSendDialog';
import { campaignsApi, listsApi } from './api/marketingApi';

/**
 * Four steps rather than one long page: content, audience, review, schedule.
 *
 * The Skoolian builder does all of this on a single 2,199-line screen. Steps
 * make the order explicit — you cannot review an audience you have not chosen —
 * and each one is small enough to take in.
 */
const STEPS = ['Content', 'Audience', 'Review', 'Schedule'] as const;
type Step = 0 | 1 | 2 | 3;

export function CampaignBuilderPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canWrite = can('marketing_email.write');
  const canSend = can('marketing_email.send');

  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [listIds, setListIds] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<'now' | 'later'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [confirming, setConfirming] = useState(false);

  const campaign = useQuery({
    queryKey: ['marketing', 'campaigns', id],
    queryFn: () => campaignsApi.get(id),
    enabled: Boolean(id),
    // A campaign in flight drains on the queue's own clock, so keep asking
    // while it does — and stop once it has finished.
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'SENDING' || s === 'SCHEDULED' ? 15_000 : false;
    },
  });
  const templates = useQuery({
    queryKey: ['messaging', 'templates', 'active'],
    queryFn: () => templatesApi.list({ limit: 100, isActive: 'true' }),
  });
  const lists = useQuery({ queryKey: ['marketing', 'lists'], queryFn: () => listsApi.list({ limit: 100 }) });

  // Same source as the lead send dialog: whether quiet hours apply changes both
  // the wording and what "now" actually means.
  const settings = useQuery({
    queryKey: ['messaging', 'settings'],
    queryFn: () => messagingApi.getSettings(),
  });
  const quietHours = settings.data?.sendingWindow.enabled ?? true;

  useEffect(() => {
    const c = campaign.data;
    if (!c) return;
    setName(c.name);
    setTemplateId(c.templateId ?? '');
    setListIds(c.lists.map((l) => l.list.id));
  }, [campaign.data]);

  const save = useMutation({
    mutationFn: () => campaignsApi.update(id, { name, templateId: templateId || null, listIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketing', 'campaigns'] }),
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  // Only fetched once the audience is chosen — it resolves every list member.
  const preview = useQuery({
    queryKey: ['marketing', 'campaigns', id, 'preview'],
    queryFn: () => campaignsApi.preview(id),
    enabled: step === 2 && Boolean(templateId) && listIds.length > 0,
  });

  const send = useMutation({
    mutationFn: () =>
      campaignsApi.send(id, schedule === 'later' && scheduledFor ? new Date(scheduledFor).toISOString() : undefined),
    onSuccess: (r) => {
      toast.success(`${r.queued} message(s) queued`);
      qc.invalidateQueries({ queryKey: ['marketing'] });
      navigate('/email/campaigns');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (campaign.isLoading) return <Skeleton className="h-[600px] w-full rounded-xl" />;
  if (!campaign.data) return <p className="text-sm text-muted-foreground">Campaign not found.</p>;

  const c = campaign.data;
  const editable = c.status === 'DRAFT' || c.status === 'SCHEDULED';
  // The template library is shared with lead follow-up; a campaign is email only.
  const templateOptions = (templates.data?.data ?? []).filter((t) => t.channel === 'EMAIL');
  const listOptions = lists.data?.data ?? [];

  const canLeaveStep: Record<Step, boolean> = {
    0: Boolean(templateId),
    1: listIds.length > 0,
    2: Boolean(preview.data && preview.data.screening.willSend > 0),
    3: true,
  };

  const goTo = (next: Step) => {
    if (canWrite && editable) save.mutate();
    setStep(next);
  };

  const whenLabel =
    schedule === 'later' && scheduledFor
      ? `on ${new Date(scheduledFor).toLocaleString('en-AU', {
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })}`
      : quietHours
        ? 'as soon as sending is allowed'
        : 'immediately';

  return (
    <div>
      <PageHeader
        title={name || 'Campaign'}
        description={editable ? 'Draft — nothing sends until you confirm' : `This campaign is ${c.status.toLowerCase()}`}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/email/campaigns')}>
            <ArrowLeft className="h-4 w-4" /> All campaigns
          </Button>
        }
      />

      {/* The four steps, with the ones already passed marked. */}
      <ol className="mb-6 flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => {
          const index = i as Step;
          const done = index < step;
          const current = index === step;
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(index)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
                  current ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted/60',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                    done ? 'bg-[#6abf2e] text-white' : current ? 'bg-primary text-white' : 'bg-muted',
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && <span className="text-muted-foreground/40">→</span>}
            </li>
          );
        })}
      </ol>

      {!editable && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            This campaign has already been {c.status.toLowerCase()} and can no longer be edited.
            {c.recipientCount > 0 && ` It went to ${c.recipientCount} recipient(s).`}
          </p>
        </div>
      )}

      {/* Once it is away, what happened matters more than how it was built. */}
      {c.progress && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {c.status === 'SENDING' ? 'Sending now' : 'What happened'}
            </CardTitle>
            <CardDescription>
              {c.startedAt && `Started ${formatDate(c.startedAt)}`}
              {c.completedAt && ` · finished ${formatDate(c.completedAt)}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {(
                [
                  ['Sent', c.progress.sent],
                  ['To go', c.progress.pending],
                  ['Failed', c.progress.failed],
                  ['Skipped', c.progress.skipped],
                  ['Cancelled', c.progress.cancelled],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <p className="text-2xl font-semibold tabular-nums">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {c.progress.pending > 0 && (
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[#6abf2e] transition-[width] duration-500"
                  style={{
                    width: `${Math.round((c.progress.sent / Math.max(c.progress.sent + c.progress.pending, 1)) * 100)}%`,
                  }}
                />
              </div>
            )}
            {c.progress.failed > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Failed messages are retried a few times before they are given up on — the send queue shows
                the provider's reason for each.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 1 — content */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Content</CardTitle>
            <CardDescription>The subject line and body come from the template.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Campaign name</Label>
              <Input id="name" value={name} disabled={!editable} onChange={(e) => setName(e.target.value)} />
              <p className="text-xs text-muted-foreground">Internal only — recipients never see it.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template">Template</Label>
              <Select
                id="template"
                value={templateId}
                disabled={!editable}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">Choose a template…</option>
                {templateOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              {!templateOptions.length && (
                <p className="text-xs text-muted-foreground">
                  No active templates yet — create one under Email Templates first.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — audience */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Audience</CardTitle>
            <CardDescription>
              Someone on two of these lists receives one email. Anyone who has unsubscribed is excluded.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!listOptions.length && (
              <p className="text-sm text-muted-foreground">No contact lists yet — create one first.</p>
            )}
            {listOptions.map((list) => (
              <label
                key={list.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={listIds.includes(list.id)}
                  disabled={!editable}
                  onChange={(e) =>
                    setListIds((prev) =>
                      e.target.checked ? [...prev, list.id] : prev.filter((x) => x !== list.id),
                    )
                  }
                />
                <span className="flex-1">
                  <span className="font-medium">{list.name}</span>
                  {list.description && (
                    <span className="ml-2 text-xs text-muted-foreground">{list.description}</span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{list._count.members}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Step 3 — review */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>As the first recipient will actually see it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.isLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Working out who can receive this…
              </p>
            )}

            {preview.data && (
              <>
                <div className="rounded-lg border p-4">
                  <p className="text-sm">
                    <span className="text-2xl font-semibold tabular-nums">{preview.data.screening.willSend}</span>{' '}
                    <span className="text-muted-foreground">
                      will receive this, of {preview.data.screening.total} on the selected list(s)
                    </span>
                  </p>
                  {(preview.data.screening.skipped.unsubscribed > 0 ||
                    preview.data.screening.skipped.duplicate > 0 ||
                    preview.data.screening.skipped.noAddress > 0) && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Excluded:{' '}
                      {[
                        preview.data.screening.skipped.unsubscribed > 0 &&
                          `${preview.data.screening.skipped.unsubscribed} unsubscribed`,
                        preview.data.screening.skipped.duplicate > 0 &&
                          `${preview.data.screening.skipped.duplicate} on more than one list`,
                        preview.data.screening.skipped.noAddress > 0 &&
                          `${preview.data.screening.skipped.noAddress} without an address`,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                </div>

                {preview.data.sample ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      As <span className="font-medium text-foreground">{preview.data.sample.name}</span> (
                      {preview.data.sample.to}) will see it:
                    </p>
                    <div className="max-h-72 overflow-y-auto rounded-lg border bg-white p-4 text-sm text-slate-800">
                      <p className="mb-2 font-medium">{preview.data.sample.subject}</p>
                      <div dangerouslySetInnerHTML={{ __html: preview.data.sample.bodyHtml }} />
                    </div>
                  </div>
                ) : (
                  <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Nobody on these lists can be emailed.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4 — schedule */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>Quiet hours and the hourly limit still apply.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={schedule}
                disabled={!editable}
                onChange={(e) => setSchedule(e.target.value as 'now' | 'later')}
                className="w-auto"
              >
                <option value="now">{quietHours ? 'As soon as sending is allowed' : 'Send immediately'}</option>
                <option value="later">{quietHours ? 'At a specific time' : 'Send at a specific time'}</option>
              </Select>
              {schedule === 'later' && (
                <Input
                  type="datetime-local"
                  value={scheduledFor}
                  disabled={!editable}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-auto"
                />
              )}
            </div>

            <div className="rounded-lg border p-4 text-sm">
              <p className="font-medium">Ready to send</p>
              <p className="mt-1 text-muted-foreground">
                {preview.data?.screening.willSend ?? c.recipientCount} recipient(s) ·{' '}
                {c.template?.name ?? 'no template'} · {whenLabel}
              </p>
            </div>

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Clock className="mt-0.5 h-3 w-3 shrink-0" />
              {quietHours
                ? 'Quiet hours are on, so anything due overnight or at a weekend waits for the next allowed hour. A large campaign is spread out by the hourly limit rather than sent all at once.'
                : 'Quiet hours are off, so this can land overnight or at a weekend. A large campaign is still spread out by the hourly limit rather than sent all at once.'}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 flex items-center justify-between gap-2">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((step - 1) as Step)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        {step < 3 ? (
          <Button disabled={!canLeaveStep[step]} onClick={() => goTo((step + 1) as Step)}>
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          canSend &&
          editable && (
            <Button disabled={!preview.data || preview.data.screening.willSend === 0} onClick={() => setConfirming(true)}>
              <Send className="h-4 w-4" /> Review &amp; send
            </Button>
          )
        )}
      </div>

      {c.completedAt && (
        <p className="mt-4 text-xs text-muted-foreground">Completed {formatDate(c.completedAt)}</p>
      )}

      {preview.data && (
        <ConfirmSendDialog
          open={confirming}
          onOpenChange={setConfirming}
          recipients={preview.data.screening.willSend}
          skipped={{
            noAddress: preview.data.screening.skipped.noAddress,
            unsubscribed: preview.data.screening.skipped.unsubscribed,
          }}
          templateName={preview.data.template.name}
          whenLabel={whenLabel}
          unrestricted={!quietHours}
          sending={send.isPending}
          onConfirm={() => send.mutate()}
        />
      )}
    </div>
  );
}
