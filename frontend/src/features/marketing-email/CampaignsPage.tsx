import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Megaphone, Ban, Loader2, Users } from 'lucide-react';
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
import { formatDate } from '@/lib/utils';
import { campaignsApi, type CampaignStatus } from './api/marketingApi';

const STATUS_BADGE: Record<CampaignStatus, { label: string; variant: 'default' | 'success' | 'secondary' | 'warning' }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  SCHEDULED: { label: 'Scheduled', variant: 'default' },
  SENDING: { label: 'Sending', variant: 'warning' },
  SENT: { label: 'Sent', variant: 'success' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
};

export function CampaignsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canWrite = can('marketing_email.write');
  const canSend = can('marketing_email.send');

  const [status, setStatus] = useState<CampaignStatus | ''>('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const campaigns = useQuery({
    queryKey: ['marketing', 'campaigns', status],
    queryFn: () => campaignsApi.list({ limit: 100, ...(status ? { status } : {}) }),
    // A campaign in flight moves on its own.
    refetchInterval: 30_000,
  });

  const create = useMutation({
    mutationFn: () => campaignsApi.create({ name }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['marketing', 'campaigns'] });
      setOpen(false);
      setName('');
      navigate(`/email/campaigns/${c.id}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => campaignsApi.cancel(id),
    onSuccess: (r) => {
      toast.success(`Stopped — ${r.cancelled} message(s) cancelled`);
      qc.invalidateQueries({ queryKey: ['marketing', 'campaigns'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const rows = campaigns.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="One-off emails to your contact lists."
        action={
          canWrite ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New campaign
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New campaign</DialogTitle>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="c-name">Name</Label>
                  <Input
                    id="c-name"
                    value={name}
                    placeholder="October newsletter"
                    onChange={(e) => setName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Internal only — the subject line comes from the template.
                  </p>
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

      <Select
        value={status}
        onChange={(e) => setStatus(e.target.value as CampaignStatus | '')}
        className="mb-4 w-auto min-w-[150px]"
      >
        <option value="">All campaigns</option>
        <option value="DRAFT">Drafts</option>
        <option value="SCHEDULED">Scheduled</option>
        <option value="SENDING">Sending</option>
        <option value="SENT">Sent</option>
        <option value="CANCELLED">Cancelled</option>
      </Select>

      {campaigns.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Megaphone className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {status ? 'No campaigns with this status.' : 'No campaigns yet.'}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              A campaign is a template, one or more lists and a time. Nothing sends until you confirm it.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => {
            const badge = STATUS_BADGE[c.status];
            const inFlight = c.status === 'SENDING' || c.status === 'SCHEDULED';
            return (
              <Card key={c.id} className="transition-colors hover:border-primary/50">
                <CardContent className="flex flex-wrap items-center gap-4 p-5">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => navigate(`/email/campaigns/${c.id}`)}
                  >
                    <p className="flex items-center gap-2 font-medium">
                      {c.name}
                      <Badge variant={badge.variant} className="text-[10px]">
                        {badge.label}
                      </Badge>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {c.template?.name ?? 'No template yet'}
                      {c.lists.length > 0 && ` · ${c.lists.map((l) => l.list.name).join(', ')}`}
                      {c.scheduledFor && ` · ${formatDate(c.scheduledFor)}`}
                    </p>
                  </button>

                  {c.progress ? (
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground tabular-nums">{c.progress.sent}</span> sent
                      {c.progress.pending > 0 && `, ${c.progress.pending} to go`}
                    </div>
                  ) : (
                    c.recipientCount > 0 && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span className="tabular-nums">{c.recipientCount}</span>
                      </div>
                    )
                  )}

                  {canSend && inFlight && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancel.mutate(c.id)}
                      disabled={cancel.isPending}
                    >
                      <Ban className="h-4 w-4" /> Stop
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
