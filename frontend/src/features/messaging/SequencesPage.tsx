import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Workflow, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { sequencesApi, type SequenceTrigger } from './api/messagingApi';

const TRIGGER_LABELS: Record<SequenceTrigger, string> = {
  LEAD_CREATED: 'New lead captured',
  DEAL_STAGE_CHANGED: 'Deal stage changed',
  DEAL_WON: 'Deal won',
  DEAL_LOST: 'Deal lost',
  CAMPAIGN: 'Campaign',
  MANUAL: 'Started by hand',
};

// Only the lead trigger does anything today; the deal ones arrive with the
// next stage. Offering them now would promise behaviour that does not exist.
const AVAILABLE_TRIGGERS: SequenceTrigger[] = ['LEAD_CREATED', 'MANUAL'];

export function SequencesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canWrite = can('messaging.write');

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<SequenceTrigger>('LEAD_CREATED');

  const sequences = useQuery({ queryKey: ['messaging', 'sequences'], queryFn: () => sequencesApi.list() });

  const create = useMutation({
    mutationFn: () => sequencesApi.create({ name, trigger }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['messaging', 'sequences'] });
      setOpen(false);
      setName('');
      navigate(`/messaging/sequences/${s.id}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => sequencesApi.update(id, { isActive }),
    onSuccess: (s) => {
      toast.success(
        s.isActive
          ? 'Sequence on — matching leads will be enrolled from now'
          : 'Sequence off — nothing new will be enrolled',
      );
      qc.invalidateQueries({ queryKey: ['messaging', 'sequences'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const rows = sequences.data ?? [];

  return (
    <div>
      <PageHeader
        title="Follow-up sequences"
        description="Automatic ladders of messages, triggered by what happens to a lead."
        action={
          canWrite ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New sequence
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New sequence</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="seq-name">Name</Label>
                    <Input
                      id="seq-name"
                      value={name}
                      placeholder="New lead follow-up"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="seq-trigger">Starts when</Label>
                    <Select
                      id="seq-trigger"
                      value={trigger}
                      onChange={(e) => setTrigger(e.target.value as SequenceTrigger)}
                    >
                      {AVAILABLE_TRIGGERS.map((t) => (
                        <option key={t} value={t}>
                          {TRIGGER_LABELS[t]}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The trigger cannot be changed later — it decides what the sequence responds to.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
                    {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      {sequences.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Workflow className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No sequences yet.</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              A sequence sends a ladder of messages after a lead comes in — an acknowledgement now, a nudge in
              two days — and stops the moment the customer replies.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <Card key={s.id} className="transition-colors hover:border-primary/50">
              <CardContent className="flex flex-wrap items-center gap-4 p-5">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate(`/messaging/sequences/${s.id}`)}
                >
                  <p className="flex items-center gap-2 font-medium">
                    {s.name}
                    <Badge variant={s.isActive ? 'success' : 'secondary'} className="text-[10px]">
                      {s.isActive ? 'On' : 'Off'}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {TRIGGER_LABELS[s.trigger]} · {s.steps.length} step{s.steps.length === 1 ? '' : 's'}
                    {s.filters?.enquiryType && ` · ${s.filters.enquiryType.toLowerCase()} only`}
                  </p>
                </button>

                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="tabular-nums">{s.enrolled?.active ?? 0}</span> in progress
                </div>

                {canWrite && (
                  <Button
                    variant={s.isActive ? 'outline' : 'default'}
                    size="sm"
                    disabled={toggle.isPending || (!s.isActive && s.steps.length === 0)}
                    onClick={() => toggle.mutate({ id: s.id, isActive: !s.isActive })}
                  >
                    {s.isActive ? 'Turn off' : 'Turn on'}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
