import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Copy, Archive, FileText, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { templatesApi, type TemplateCategory } from './api/messagingApi';
import { formatDateTime } from './messagingHelpers';

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  REFERRAL: 'Referral',
  FOLLOW_UP: 'Follow-up',
  AFTERCARE: 'Aftercare',
  QUOTE: 'Quote',
  TRANSACTIONAL: 'Transactional',
  OTHER: 'Other',
};

const STARTER_BODY =
  '<p>Hi {{firstName}},</p><p>Write your message here.</p><p>Kind regards,<br>{{repName}}</p>';

export function TemplateLibraryPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canWrite = can('messaging.write');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<TemplateCategory | ''>('');
  const [showArchived, setShowArchived] = useState(false);

  const templates = useQuery({
    queryKey: ['messaging', 'templates', { search, category, showArchived }],
    queryFn: () =>
      templatesApi.list({
        limit: 100,
        ...(search ? { search } : {}),
        ...(category ? { category } : {}),
        ...(showArchived ? {} : { isActive: 'true' as const }),
      }),
  });

  const create = useMutation({
    mutationFn: () =>
      templatesApi.create({ name: 'Untitled template', bodyHtml: STARTER_BODY, subject: 'Hi {{firstName}}' }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['messaging', 'templates'] });
      navigate(`/messaging/templates/${t.id}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => templatesApi.duplicate(id),
    onSuccess: (t) => {
      toast.success('Copied — the copy is archived until you activate it');
      qc.invalidateQueries({ queryKey: ['messaging', 'templates'] });
      navigate(`/messaging/templates/${t.id}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const archive = useMutation({
    mutationFn: (id: string) => templatesApi.remove(id),
    onSuccess: () => {
      toast.success('Template archived — messages already sent still reference it');
      qc.invalidateQueries({ queryKey: ['messaging', 'templates'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const rows = templates.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Email templates"
        description="Reusable copy for follow-ups, referrals and aftercare."
        action={
          canWrite ? (
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              <Plus className="h-4 w-4" /> New template
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value as TemplateCategory | '')}
          className="w-auto min-w-[150px]"
        >
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {templates.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search || category ? 'No templates match.' : 'No templates yet.'}
            </p>
            {canWrite && !search && !category && (
              <Button variant="outline" size="sm" onClick={() => create.mutate()}>
                <Plus className="h-4 w-4" /> Create the first one
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <Card
              key={t.id}
              className="cursor-pointer transition-colors hover:border-primary/50"
              onClick={() => navigate(`/messaging/templates/${t.id}`)}
            >
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.subject ?? 'No subject'}</p>
                  </div>
                  <Badge variant={t.isActive ? 'default' : 'secondary'} className="shrink-0 text-[10px]">
                    {t.isActive ? CATEGORY_LABELS[t.category] : 'Archived'}
                  </Badge>
                </div>

                <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    v{t.currentVersion} · edited {formatDateTime(t.updatedAt)}
                  </span>
                  {canWrite && (
                    <span className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Duplicate"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicate.mutate(t.id);
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {t.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Archive"
                          onClick={(e) => {
                            e.stopPropagation();
                            archive.mutate(t.id);
                          }}
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
