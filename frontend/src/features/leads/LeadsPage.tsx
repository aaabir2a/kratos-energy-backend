import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Search, Target, Users2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { leadsApi, sourcesApi, pipelineApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { initials, formatDate, cn } from '@/lib/utils';
import { StageBadge, StatusBadge, PriorityDot, fullName } from './leadHelpers';
import { isBuildLead, BuildBadge } from './buildConfig';

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as const;

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  suburb: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  estimatedSystemSize: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  leadSourceId: z.string().optional(),
  autoAssign: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: number | string; icon: React.ElementType; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function LeadsPage() {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [stageId, setStageId] = useState('');
  const [status, setStatus] = useState('');
  const [sourceId, setSourceId] = useState('');

  const stats = useQuery({ queryKey: ['leads', 'stats'], queryFn: () => leadsApi.stats() });
  const stages = useQuery({ queryKey: ['pipeline', 'stages'], queryFn: () => pipelineApi.stages() });
  const sources = useQuery({ queryKey: ['sources'], queryFn: () => sourcesApi.list() });
  const leads = useQuery({
    queryKey: ['leads', { search, stageId, status, sourceId }],
    queryFn: () =>
      leadsApi.list({
        search: search || undefined,
        stageId: stageId || undefined,
        status: status || undefined,
        leadSourceId: sourceId || undefined,
        limit: 50,
      }),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', priority: 'MEDIUM', autoAssign: true },
  });

  const create = useMutation({
    mutationFn: (v: FormValues) =>
      leadsApi.create({
        ...v,
        email: v.email || undefined,
        state: v.state || undefined,
        leadSourceId: v.leadSourceId || undefined,
      }),
    onSuccess: (lead) => {
      toast.success(`Lead created — assigned to ${fullName(lead.assignedTo)}`);
      qc.invalidateQueries({ queryKey: ['leads'] });
      setOpen(false);
      form.reset();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const data = leads.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Capture, assign and track every enquiry."
        action={
          can('leads.write') && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New lead
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Create lead</DialogTitle>
                </DialogHeader>
                <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>First name</Label>
                      <Input {...form.register('firstName')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Last name</Label>
                      <Input {...form.register('lastName')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" {...form.register('email')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input {...form.register('phone')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>Suburb</Label>
                      <Input {...form.register('suburb')} />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Select {...form.register('state')}>
                        <option value="">—</option>
                        {AU_STATES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Postcode</Label>
                      <Input {...form.register('postcode')} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label>System size</Label>
                      <Input placeholder="6.6kW" {...form.register('estimatedSystemSize')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select {...form.register('priority')}>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Source</Label>
                      <Select {...form.register('leadSourceId')}>
                        <option value="">—</option>
                        {sources.data?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-primary" {...form.register('autoAssign')} />
                    Auto-assign to a sales rep (round-robin)
                  </label>
                  <DialogFooter>
                    <Button type="submit" disabled={create.isPending}>
                      {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Create lead
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total leads" value={stats.data?.total ?? '—'} icon={Target} tone="bg-primary/10 text-primary" />
        <StatCard label="Open" value={stats.data?.open ?? '—'} icon={Users2} tone="bg-blue-500/10 text-blue-500" />
        <StatCard label="Converted" value={stats.data?.converted ?? '—'} icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-500" />
        <StatCard label="Lost" value={stats.data?.lost ?? '—'} icon={XCircle} tone="bg-red-500/10 text-red-500" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search leads…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={stageId} onChange={(e) => setStageId(e.target.value)} className="w-auto min-w-[140px]">
          <option value="">All stages</option>
          {stages.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[130px]">
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="CONVERTED">Converted</option>
          <option value="LOST">Lost</option>
        </Select>
        <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="w-auto min-w-[140px]">
          <option value="">All sources</option>
          {sources.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {leads.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Target className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No leads match your filters.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((l) => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/leads/${l.id}`)}>
                  <TableCell>
                    <p className="font-medium">
                      {l.firstName} {l.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {l.email ?? l.phone ?? '—'}
                      {l.suburb && ` · ${l.suburb}${l.state ? `, ${l.state}` : ''}`}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={l.stage} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={l.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityDot priority={l.priority} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.source?.name ?? '—'}</TableCell>
                  <TableCell>
                    {l.assignedTo ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px]">
                            {initials(l.assignedTo.firstName, l.assignedTo.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{l.assignedTo.firstName}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>{isBuildLead(l.customFormResponses) ? <BuildBadge /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(l.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
