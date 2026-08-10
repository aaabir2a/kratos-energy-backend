import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Shuffle, UserCheck, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { settingsApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';

export function LeadAssignmentPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can('settings.write');

  const settings = useQuery({ queryKey: ['app-settings'], queryFn: () => settingsApi.get() });

  const save = useMutation({
    mutationFn: (enabled: boolean) => settingsApi.setLeadAutoAssign(enabled),
    onSuccess: (d) => {
      toast.success(
        d.leadAutoAssign
          ? 'Auto-assignment on — new leads go to a rep automatically'
          : 'Auto-assignment off — new leads arrive unassigned',
      );
      qc.invalidateQueries({ queryKey: ['app-settings'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (settings.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  const enabled = settings.data?.leadAutoAssign ?? true;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Lead assignment"
        description="Control how incoming leads are given to sales reps."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shuffle className="h-4 w-4" /> Automatic round-robin
            <Badge variant={enabled ? 'success' : 'secondary'} className="ml-auto">
              {enabled ? 'On' : 'Off'}
            </Badge>
          </CardTitle>
          <CardDescription>
            When on, every new lead is assigned to the active sales rep with the fewest open leads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!canWrite || save.isPending}
              onClick={() => save.mutate(true)}
              className={cn(
                'rounded-lg border p-4 text-left transition-colors disabled:opacity-60',
                enabled ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
              )}
            >
              <p className="flex items-center gap-2 font-medium">
                <Shuffle className="h-4 w-4 text-primary" /> Automatic
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Leads are auto-assigned round-robin the moment they arrive.
              </p>
            </button>

            <button
              type="button"
              disabled={!canWrite || save.isPending}
              onClick={() => save.mutate(false)}
              className={cn(
                'rounded-lg border p-4 text-left transition-colors disabled:opacity-60',
                !enabled ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50',
              )}
            >
              <p className="flex items-center gap-2 font-medium">
                <UserCheck className="h-4 w-4 text-primary" /> Manual
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Leads arrive unassigned; a manager assigns them from the lead page.
              </p>
            </button>
          </div>

          {save.isPending && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </p>
          )}

          <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              The assigned rep is emailed either way — automatically on capture, or when someone assigns the
              lead by hand. Manual assignment from a lead's page always works, regardless of this setting.
            </p>
          </div>

          {!canWrite && (
            <p className="text-xs text-muted-foreground">You need the settings.write permission to change this.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
