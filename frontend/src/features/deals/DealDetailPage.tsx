import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trophy, XCircle, Plus, Trash2, Loader2, History } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { dealsApi, pipelineApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/utils';
import { StageBadge } from '@/features/leads/leadHelpers';

function money(v: string | number) {
  return `$${Number(v).toLocaleString()}`;
}

export function DealDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [loseOpen, setLoseOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');

  const deal = useQuery({ queryKey: ['deal', id], queryFn: () => dealsApi.get(id) });
  const stages = useQuery({ queryKey: ['pipeline', 'stages', 'DEAL'], queryFn: () => pipelineApi.stages('DEAL') });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['deal', id] });
    qc.invalidateQueries({ queryKey: ['deals'] });
  };

  const moveStage = useMutation({
    mutationFn: (stageId: string) => dealsApi.moveStage(id, stageId),
    onSuccess: () => {
      toast.success('Stage updated');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const win = useMutation({
    mutationFn: () => dealsApi.win(id),
    onSuccess: () => {
      toast.success('Deal closed WON 🎉');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const lose = useMutation({
    mutationFn: () => dealsApi.lose(id, lostReason),
    onSuccess: () => {
      toast.success('Deal closed lost');
      setLoseOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const addItem = useMutation({
    mutationFn: () => dealsApi.addItem(id, { description: desc, quantity: Number(qty) || 1, unitPrice: Number(price) || 0 }),
    onSuccess: () => {
      setDesc('');
      setQty('1');
      setPrice('');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => dealsApi.removeItem(id, itemId),
    onSuccess: invalidate,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (deal.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!deal.data) {
    return (
      <div className="text-center text-sm text-muted-foreground">
        Deal not found. <Link to="/deals" className="text-primary underline">Back to deals</Link>
      </div>
    );
  }

  const d = deal.data;
  const isOpen = d.status === 'OPEN';
  const canClose = can('deals.close');
  const canEdit = can('deals.write') && isOpen;

  return (
    <div>
      <button onClick={() => navigate('/deals')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to deals
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Deal D-{d.dealNumber}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{d.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <Badge variant={d.status === 'WON' ? 'success' : d.status === 'LOST' ? 'destructive' : 'default'}>
              {d.status}
            </Badge>
            <StageBadge stage={d.stage} />
            <span className="text-lg font-semibold">{money(d.value)}</span>
          </div>
          {d.lostReason && <p className="mt-1 text-sm text-destructive">Lost: {d.lostReason}</p>}
        </div>
        {isOpen && canClose && (
          <div className="flex gap-2">
            <Button onClick={() => win.mutate()} disabled={win.isPending} className="bg-emerald-600 hover:bg-emerald-600/90">
              {win.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />} Close won
            </Button>
            <Button variant="destructive" onClick={() => setLoseOpen(true)}>
              <XCircle className="h-4 w-4" /> Close lost
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Link to={`/leads/${d.lead.id}`} className="font-medium text-primary hover:underline">
                {d.lead.firstName} {d.lead.lastName}
              </Link>
              <p className="text-muted-foreground">{d.lead.email ?? d.lead.phone ?? '—'}</p>
              {d.lead.suburb && (
                <p className="text-muted-foreground">
                  {d.lead.suburb}
                  {d.lead.state ? `, ${d.lead.state}` : ''}
                </p>
              )}
              {d.lead.source && <p className="text-xs text-muted-foreground">Source: {d.lead.source.name}</p>}
            </CardContent>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Stage</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={d.stage?.id ?? ''} onChange={(e) => moveStage.mutate(e.target.value)} disabled={moveStage.isPending}>
                  {stages.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </CardContent>
            </Card>
          )}

          {d.stageHistory && d.stageHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" /> Stage history
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {d.stageHistory.map((h) => (
                  <div key={h.id} className="border-b pb-2 last:border-0">
                    <p className="font-medium text-sm">{h.reason ?? 'Stage changed'}</p>
                    <p className="text-muted-foreground">
                      {h.changedBy ? `${h.changedBy.firstName} ${h.changedBy.lastName}` : 'System'} · {formatDate(h.changedAt)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {d.items.length ? (
                <div className="divide-y rounded-lg border">
                  {d.items.map((i) => (
                    <div key={i.id} className="flex items-center gap-3 p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{i.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {i.itemType.toLowerCase()} · {i.quantity} × {money(i.unitPrice)}
                        </p>
                      </div>
                      <span className="font-medium">{money(i.lineTotal)}</span>
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => removeItem.mutate(i.id)}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 font-semibold">
                    <span>Total</span>
                    <span>{money(d.value)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No line items.</p>
              )}

              {canEdit && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[200px] flex-1">
                    <Input placeholder="Item description" value={desc} onChange={(e) => setDesc(e.target.value)} />
                  </div>
                  <Input placeholder="Qty" type="number" min={1} className="w-20" value={qty} onChange={(e) => setQty(e.target.value)} />
                  <Input placeholder="Unit price" type="number" min={0} className="w-32" value={price} onChange={(e) => setPrice(e.target.value)} />
                  <Button onClick={() => addItem.mutate()} disabled={!desc || addItem.isPending}>
                    {addItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={loseOpen} onOpenChange={setLoseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close deal as lost</DialogTitle>
          </DialogHeader>
          <Textarea placeholder="Why was this deal lost?" value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
          <DialogFooter>
            <Button variant="destructive" onClick={() => lose.mutate()} disabled={!lostReason || lose.isPending}>
              {lose.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Close lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
