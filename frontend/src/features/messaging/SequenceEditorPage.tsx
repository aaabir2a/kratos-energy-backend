import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Clock, Save, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { sequencesApi, templatesApi } from './api/messagingApi';

interface DraftStep {
  templateId: string;
  delayMinutes: number;
}

/** Delays are stored in minutes; staff think in days and hours. */
const DELAY_PRESETS = [
  { label: 'Immediately', minutes: 0 },
  { label: 'After 1 hour', minutes: 60 },
  { label: 'After 1 day', minutes: 1440 },
  { label: 'After 2 days', minutes: 2880 },
  { label: 'After 3 days', minutes: 4320 },
  { label: 'After 5 days', minutes: 7200 },
  { label: 'After 1 week', minutes: 10080 },
  { label: 'After 2 weeks', minutes: 20160 },
  { label: 'After 1 month', minutes: 43200 },
];

const delayLabel = (minutes: number) =>
  DELAY_PRESETS.find((p) => p.minutes === minutes)?.label ?? `After ${Math.round(minutes / 1440)} days`;

export function SequenceEditorPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canWrite = can('messaging.write');

  const sequence = useQuery({
    queryKey: ['messaging', 'sequences', id],
    queryFn: () => sequencesApi.get(id),
    enabled: Boolean(id),
  });
  const templates = useQuery({
    queryKey: ['messaging', 'templates', 'active'],
    queryFn: () => templatesApi.list({ limit: 100, isActive: 'true' }),
  });

  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [name, setName] = useState('');
  const [enquiryType, setEnquiryType] = useState<'' | 'RESIDENTIAL' | 'COMMERCIAL'>('');
  const [stopRules, setStopRules] = useState({ reply: true, stage: true, convert: true });

  useEffect(() => {
    const s = sequence.data;
    if (!s) return;
    setName(s.name);
    setSteps(s.steps.map((step) => ({ templateId: step.templateId, delayMinutes: step.delayMinutes })));
    setEnquiryType(s.filters?.enquiryType ?? '');
    setStopRules({ reply: s.stopOnReply, stage: s.stopOnStageChange, convert: s.stopOnConvert });
  }, [sequence.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['messaging', 'sequences'] });

  const saveSettings = useMutation({
    mutationFn: () =>
      sequencesApi.update(id, {
        name,
        filters: enquiryType ? { enquiryType } : null,
        stopOnReply: stopRules.reply,
        stopOnStageChange: stopRules.stage,
        stopOnConvert: stopRules.convert,
      } as never),
    onSuccess: () => {
      toast.success('Sequence saved');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const saveSteps = useMutation({
    mutationFn: () => sequencesApi.setSteps(id, steps),
    onSuccess: () => {
      toast.success('Steps saved');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (sequence.isLoading) return <Skeleton className="h-[600px] w-full rounded-xl" />;
  if (!sequence.data) return <p className="text-sm text-muted-foreground">Sequence not found.</p>;

  const templateOptions = templates.data?.data ?? [];
  const live = sequence.data.isActive;

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      {
        templateId: templateOptions[0]?.id ?? '',
        // Each new step lands a couple of days after the last, which is the
        // shape most ladders want anyway.
        delayMinutes: prev.length === 0 ? 0 : (prev[prev.length - 1].delayMinutes || 0) + 2880,
      },
    ]);

  return (
    <div>
      <PageHeader
        title={name || 'Sequence'}
        description={`${sequence.data.steps.length} step${sequence.data.steps.length === 1 ? '' : 's'} · ${
          sequence.data.enrolled?.active ?? 0
        } lead(s) in progress`}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={live ? 'success' : 'secondary'}>{live ? 'On' : 'Off'}</Badge>
            <Button variant="ghost" size="sm" onClick={() => navigate('/messaging/sequences')}>
              <ArrowLeft className="h-4 w-4" /> All sequences
            </Button>
          </div>
        }
      />

      {live && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            This sequence is live. Changing the steps affects leads enrolled from now on — anyone already part
            way through keeps the ladder they started with.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Steps</CardTitle>
                <CardDescription>Each delay is measured from when the lead joins, not from the step before.</CardDescription>
              </div>
              {canWrite && (
                <Button variant="outline" size="sm" onClick={addStep} disabled={!templateOptions.length}>
                  <Plus className="h-4 w-4" /> Add step
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {!templateOptions.length && (
                <p className="text-sm text-muted-foreground">
                  No active templates yet — create one first and it will appear here.
                </p>
              )}

              {steps.map((step, index) => (
                <div key={index} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                    {index + 1}
                  </span>

                  <div className="min-w-[160px] flex-1">
                    <Select
                      value={step.templateId}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s, i) => (i === index ? { ...s, templateId: e.target.value } : s)),
                        )
                      }
                    >
                      {templateOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="min-w-[150px]">
                    <Select
                      value={String(step.delayMinutes)}
                      disabled={!canWrite}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s, i) =>
                            i === index ? { ...s, delayMinutes: Number(e.target.value) } : s,
                          ),
                        )
                      }
                    >
                      {DELAY_PRESETS.map((p) => (
                        <option key={p.minutes} value={p.minutes}>
                          {p.label}
                        </option>
                      ))}
                      {!DELAY_PRESETS.some((p) => p.minutes === step.delayMinutes) && (
                        <option value={step.delayMinutes}>{delayLabel(step.delayMinutes)}</option>
                      )}
                    </Select>
                  </div>

                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}

              {!steps.length && templateOptions.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  No steps yet. A sequence needs at least one before it can be switched on.
                </p>
              )}

              {canWrite && (
                <Button disabled={saveSteps.isPending} onClick={() => saveSteps.mutate()}>
                  {saveSteps.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save steps
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} disabled={!canWrite} onChange={(e) => setName(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="enquiry">Only enrol</Label>
                <Select
                  id="enquiry"
                  value={enquiryType}
                  disabled={!canWrite}
                  onChange={(e) => setEnquiryType(e.target.value as typeof enquiryType)}
                >
                  <option value="">Every new lead</option>
                  <option value="RESIDENTIAL">Residential leads only</option>
                  <option value="COMMERCIAL">Commercial leads only</option>
                </Select>
              </div>

              {canWrite && (
                <Button variant="outline" disabled={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
                  {saveSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save settings
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" /> Stop rules
              </CardTitle>
              <CardDescription>
                When to cancel everything still queued. A follow-up that arrives after the customer has already
                replied is worse than none at all.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {(
                [
                  ['reply', 'The customer replies'],
                  ['stage', 'The lead moves to another stage'],
                  ['convert', 'The lead converts to a deal'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={stopRules[key]}
                    disabled={!canWrite}
                    onChange={(e) => setStopRules((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                Unsubscribing and marking a lead lost always stop a sequence — those are not optional.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
