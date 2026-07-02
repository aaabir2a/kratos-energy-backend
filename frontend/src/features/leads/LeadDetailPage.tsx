import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Loader2,
  Send,
  Pin,
  PhoneCall,
  CalendarClock,
  StickyNote,
  UserCog,
  GitBranch,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { leadsApi, pipelineApi, usersApi, dealsApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { initials, formatDate } from '@/lib/utils';
import { StatusBadge, PriorityDot, StageBadge, fullName } from './leadHelpers';
import type { LeadActivity } from '@/lib/api/types';

const ACTIVITY_ICON: Record<LeadActivity['type'], React.ElementType> = {
  CALL: PhoneCall,
  EMAIL: Mail,
  SMS: Send,
  MEETING: CalendarClock,
  NOTE: StickyNote,
  STAGE_CHANGE: GitBranch,
  ASSIGNMENT: UserCog,
  SYSTEM: Zap,
};

export function LeadDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [note, setNote] = useState('');
  const [actType, setActType] = useState<'CALL' | 'EMAIL' | 'SMS' | 'MEETING'>('CALL');
  const [actBody, setActBody] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);
  const [dealValue, setDealValue] = useState('');
  const [dealClose, setDealClose] = useState('');

  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => leadsApi.get(id) });
  const activities = useQuery({ queryKey: ['lead', id, 'activities'], queryFn: () => leadsApi.activities(id) });
  const notes = useQuery({ queryKey: ['lead', id, 'notes'], queryFn: () => leadsApi.notes(id) });
  const attributions = useQuery({ queryKey: ['lead', id, 'attributions'], queryFn: () => leadsApi.attributions(id) });
  const stages = useQuery({ queryKey: ['pipeline', 'stages'], queryFn: () => pipelineApi.stages() });
  const reps = useQuery({
    queryKey: ['users', 'sales'],
    queryFn: () => usersApi.list({ limit: 100 }),
    enabled: can('leads.assign') && can('users.read'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['lead', id] });
    qc.invalidateQueries({ queryKey: ['leads'] });
  };

  const moveStage = useMutation({
    mutationFn: (stageId: string) => leadsApi.moveStage(id, stageId),
    onSuccess: () => {
      toast.success('Stage updated');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const assign = useMutation({
    mutationFn: (assignedToId: string) => leadsApi.assign(id, assignedToId || null, !assignedToId),
    onSuccess: () => {
      toast.success('Assignment updated');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const addNote = useMutation({
    mutationFn: () => leadsApi.addNote(id, note),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['lead', id, 'notes'] });
      toast.success('Note added');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const convert = useMutation({
    mutationFn: () =>
      dealsApi.convert(id, {
        ...(dealValue ? { value: Number(dealValue) } : {}),
        ...(dealClose ? { expectedCloseDate: dealClose } : {}),
      }),
    onSuccess: (deal) => {
      toast.success(`Deal D-${deal.dealNumber} created`);
      setConvertOpen(false);
      invalidate();
      navigate(`/deals/${deal.id}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const logActivity = useMutation({
    mutationFn: () => leadsApi.addActivity(id, { type: actType, body: actBody }),
    onSuccess: () => {
      setActBody('');
      qc.invalidateQueries({ queryKey: ['lead', id, 'activities'] });
      toast.success('Activity logged');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (lead.isLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }
  if (lead.isError || !lead.data) {
    return (
      <div className="text-center text-sm text-muted-foreground">
        Lead not found.{' '}
        <Link to="/leads" className="text-primary underline">
          Back to leads
        </Link>
      </div>
    );
  }

  const l = lead.data;
  const canEdit = can('leads.write');
  const salesReps = reps.data?.data.filter((u) => u.role.slug === 'sales') ?? [];

  return (
    <div>
      <button
        onClick={() => navigate('/leads')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg">{initials(l.firstName, l.lastName)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {l.firstName} {l.lastName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <StatusBadge status={l.status} />
              <StageBadge stage={l.stage} />
              <PriorityDot priority={l.priority} />
            </div>
          </div>
        </div>
        {l.status === 'OPEN' && can('leads.convert') && (
          <Button onClick={() => setConvertOpen(true)}>
            <Zap className="h-4 w-4" /> Convert to deal
          </Button>
        )}
      </div>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Estimated value ($, optional)</Label>
              <Input type="number" min={0} placeholder="e.g. 8990" value={dealValue} onChange={(e) => setDealValue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Expected close date (optional)</Label>
              <Input type="date" value={dealClose} onChange={(e) => setDealClose(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              The lead is marked converted; the deal starts at the Quoted stage owned by the lead's assignee.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
              {convert.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: details + workflow */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {l.email ?? '—'}
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                {l.phone ?? '—'}
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <span>
                  {[l.addressLine, l.suburb, l.state, l.postcode].filter(Boolean).join(', ') || '—'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground">{l.estimatedSystemSize ?? '—'}</p>
                  System size
                </div>
                <div>
                  <p className="font-medium text-foreground">{l.source?.name ?? '—'}</p>
                  Source
                </div>
              </div>
            </CardContent>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Workflow</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Stage</label>
                  <Select
                    value={l.stage?.id ?? ''}
                    onChange={(e) => moveStage.mutate(e.target.value)}
                    disabled={moveStage.isPending}
                  >
                    {stages.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {can('leads.assign') && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Assigned to</label>
                    <Select
                      value={l.assignedTo?.id ?? ''}
                      onChange={(e) => assign.mutate(e.target.value)}
                      disabled={assign.isPending}
                    >
                      <option value="">Auto-assign (round-robin)</option>
                      {salesReps.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!canEdit && (
            <Card>
              <CardContent className="p-4 text-sm">
                <p className="text-xs text-muted-foreground">Assigned to</p>
                <p className="font-medium">{fullName(l.assignedTo)}</p>
              </CardContent>
            </Card>
          )}

          {attributions.data && attributions.data.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Attribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {attributions.data.map((a) => (
                  <div key={a.id} className="rounded-lg border bg-muted/30 p-3 text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-semibold uppercase tracking-wide text-muted-foreground">
                        {a.touchType === 'FIRST' ? 'First touch' : 'Last touch'}
                      </span>
                      <span className="text-muted-foreground">{formatDate(a.createdAt)}</span>
                    </div>
                    <p className="font-medium text-sm">{a.source?.name ?? 'Unknown source'}</p>
                    {(a.utmSource || a.utmCampaign) && (
                      <p className="mt-0.5 text-muted-foreground">
                        {[a.utmSource, a.utmMedium, a.utmCampaign].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {a.campaign && <p className="mt-0.5 text-muted-foreground">Campaign: {a.campaign.name}</p>}
                    {(a.gclid || a.fbclid) && (
                      <p className="mt-0.5 truncate text-muted-foreground">
                        {a.gclid ? `gclid: ${a.gclid}` : `fbclid: ${a.fbclid}`}
                      </p>
                    )}
                    {a.referrerUrl && <p className="mt-0.5 truncate text-muted-foreground">Ref: {a.referrerUrl}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: activity + notes */}
        <div className="space-y-6 lg:col-span-2">
          {can('activities.write') && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Select value={actType} onChange={(e) => setActType(e.target.value as never)} className="w-auto min-w-[120px]">
                    <option value="CALL">Call</option>
                    <option value="EMAIL">Email</option>
                    <option value="SMS">SMS</option>
                    <option value="MEETING">Meeting</option>
                  </Select>
                  <Input
                    placeholder="Log an activity…"
                    value={actBody}
                    onChange={(e) => setActBody(e.target.value)}
                  />
                  <Button
                    onClick={() => logActivity.mutate()}
                    disabled={!actBody || logActivity.isPending}
                    size="icon"
                  >
                    {logActivity.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Activity timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !activities.data?.length ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <div className="space-y-4">
                  {activities.data.map((a) => {
                    const Icon = ACTIVITY_ICON[a.type];
                    return (
                      <div key={a.id} className="flex gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 border-b pb-3 last:border-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">{a.subject ?? a.type}</p>
                            <span className="text-xs text-muted-foreground">{formatDate(a.occurredAt)}</span>
                          </div>
                          {a.body && <p className="mt-0.5 text-sm text-muted-foreground">{a.body}</p>}
                          {a.user && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              by {a.user.firstName} {a.user.lastName}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {can('activities.write') && (
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add an internal note…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="min-h-[60px]"
                  />
                  <Button onClick={() => addNote.mutate()} disabled={!note || addNote.isPending} className="self-end">
                    {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                  </Button>
                </div>
              )}
              {notes.data?.length ? (
                <div className="space-y-2">
                  {notes.data.map((n) => (
                    <div key={n.id} className="rounded-lg border bg-muted/30 p-3">
                      <p className="text-sm">{n.body}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        {n.isPinned && <Pin className="h-3 w-3" />}
                        {n.author ? `${n.author.firstName} ${n.author.lastName}` : 'System'} · {formatDate(n.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
