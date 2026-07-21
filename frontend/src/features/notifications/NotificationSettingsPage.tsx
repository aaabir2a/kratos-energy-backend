import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, X, Save, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { notificationsApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NotificationSettingsPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can('settings.write');

  const settings = useQuery({ queryKey: ['notif-settings'], queryFn: () => notificationsApi.getSettings() });

  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (settings.data) setEmails(settings.data.adminEmails);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => notificationsApi.saveSettings(emails),
    onSuccess: (d) => {
      setEmails(d.adminEmails);
      toast.success('Recipients saved');
      qc.invalidateQueries({ queryKey: ['notif-settings'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  function addEmail() {
    const e = draft.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e)) {
      toast.error('Enter a valid email');
      return;
    }
    if (emails.includes(e)) {
      setDraft('');
      return;
    }
    setEmails((prev) => [...prev, e]);
    setDraft('');
  }

  if (settings.isLoading) return <Skeleton className="h-72 w-full rounded-xl" />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notification recipients"
        description="Shared inboxes that receive admin notifications (new leads, chat hand-offs). Individual reps and managers are notified at their own account email automatically."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Shared recipients
          </CardTitle>
          <CardDescription>These addresses get emailed for organisation-wide events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canWrite && (
            <div className="flex items-center gap-2">
              <Input
                type="email"
                placeholder="sales@kratos-energy.com"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addEmail();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addEmail}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {emails.length ? `${emails.length} recipient${emails.length > 1 ? 's' : ''}` : 'No recipients yet'}
            </Label>
            {emails.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Add at least one address to receive new-lead notifications.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {emails.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-3 pr-1.5 text-sm">
                    {e}
                    {canWrite && (
                      <button
                        onClick={() => setEmails((prev) => prev.filter((x) => x !== e))}
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Remove ${e}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {canWrite && (
            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
