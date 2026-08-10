import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { leadsApi, sourcesApi, pipelineApi, usersApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';

// Origin values are stamped onto customFormResponses.lead_source by the intake
// service — keep in sync with OriginBadge.
const ORIGINS = [
  { value: 'landing_page', label: 'Landing page' },
  { value: 'custom_form', label: 'Custom form' },
  { value: 'website', label: 'Website (global form)' },
  { value: 'build_configurator', label: 'Build configurator' },
  { value: 'none', label: 'No origin recorded' },
];

const EMPTY = {
  dateFrom: '',
  dateTo: '',
  leadSourceId: '',
  origin: '',
  assignedToId: '',
  stageId: '',
  status: '',
  priority: '',
};

export function ExportLeadsDialog() {
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ ...EMPTY });

  const sources = useQuery({ queryKey: ['sources'], queryFn: () => sourcesApi.list(), enabled: open });
  const stages = useQuery({ queryKey: ['pipeline', 'stages'], queryFn: () => pipelineApi.stages(), enabled: open });
  const users = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => usersApi.list({ limit: 100 }),
    enabled: open && can('users.read'),
  });

  if (!can('leads.export')) return null;

  async function download() {
    setBusy(true);
    try {
      await leadsApi.exportCsv(f);
      toast.success('Export downloaded');
      setOpen(false);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const activeCount = Object.values(f).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4" /> Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Export leads to CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Leave a filter blank to include everything. Only leads you can already see are exported.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Created from</Label>
              <Input type="date" value={f.dateFrom} onChange={(e) => setF({ ...f, dateFrom: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Created to</Label>
              <Input type="date" value={f.dateTo} onChange={(e) => setF({ ...f, dateTo: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={f.leadSourceId} onChange={(e) => setF({ ...f, leadSourceId: e.target.value })}>
                <option value="">All sources</option>
                {sources.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Origin</Label>
              <Select value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })}>
                <option value="">All origins</option>
                {ORIGINS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Assigned to</Label>
              <Select value={f.assignedToId} onChange={(e) => setF({ ...f, assignedToId: e.target.value })}>
                <option value="">Anyone</option>
                <option value="unassigned">Unassigned</option>
                {users.data?.data.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={f.stageId} onChange={(e) => setF({ ...f, stageId: e.target.value })}>
                <option value="">All stages</option>
                {stages.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                <option value="">All statuses</option>
                <option value="OPEN">Open</option>
                <option value="CONVERTED">Converted</option>
                <option value="LOST">Lost</option>
                <option value="JUNK">Junk</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
                <option value="">Any priority</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="items-center justify-between sm:justify-between">
          <button
            type="button"
            onClick={() => setF({ ...EMPTY })}
            disabled={!activeCount}
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Clear {activeCount ? `(${activeCount})` : ''} filters
          </button>
          <Button onClick={download} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
