import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PageHeader } from '@/components/PageHeader';
import { pipelineApi } from '@/lib/api/endpoints';
import { initials } from '@/lib/utils';
import { PriorityDot } from '@/features/leads/leadHelpers';

export function PipelinePage() {
  const navigate = useNavigate();
  const board = useQuery({ queryKey: ['pipeline', 'board'], queryFn: () => pipelineApi.board() });

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Pipeline" description="Open leads by stage. Click a card to work it." />

      {board.isLoading ? (
        <div className="grid flex-1 grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-full min-h-[400px] w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {board.data?.map((col) => (
            <div key={col.id} className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/40">
              <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color ?? '#64748b' }} />
                  <span className="text-sm font-semibold">{col.name}</span>
                </div>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {col.leads.length}
                </span>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {col.leads.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 py-8 text-center text-muted-foreground/50">
                    <Layers className="h-6 w-6" />
                    <span className="text-xs">No leads</span>
                  </div>
                ) : (
                  col.leads.map((lead) => (
                    <button
                      key={lead.id}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                      className="w-full rounded-lg border bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">
                          {lead.firstName} {lead.lastName}
                        </p>
                        <PriorityDot priority={lead.priority} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {lead.suburb ? `${lead.suburb}${lead.state ? `, ${lead.state}` : ''}` : lead.phone ?? lead.email ?? '—'}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{lead.estimatedSystemSize ?? ''}</span>
                        {lead.assignedTo ? (
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[9px]">
                              {initials(lead.assignedTo.firstName, lead.assignedTo.lastName)}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Unassigned</span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
