import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Send, Eye, Plus, History, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import TextEditor from '@/features/blogs/components/blocks/TextEditor';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { templatesApi, type TemplateCategory } from './api/messagingApi';
import { formatDateTime } from './messagingHelpers';

const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'AFTERCARE', label: 'Aftercare' },
  { value: 'QUOTE', label: 'Quote' },
  { value: 'TRANSACTIONAL', label: 'Transactional' },
  { value: 'OTHER', label: 'Other' },
];

export function TemplateEditorPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canWrite = can('messaging.write');
  const canSend = can('messaging.send');

  const template = useQuery({
    queryKey: ['messaging', 'templates', id],
    queryFn: () => templatesApi.get(id),
    enabled: Boolean(id),
  });
  const mergeFields = useQuery({ queryKey: ['messaging', 'merge-fields'], queryFn: () => templatesApi.mergeFields() });

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('OTHER');
  const [bodyHtml, setBodyHtml] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const t = template.data;
    if (!t) return;
    setName(t.name);
    setSubject(t.subject ?? '');
    setCategory(t.category);
    setBodyHtml(t.bodyHtml);
    setIsActive(t.isActive);
  }, [template.data]);

  const save = useMutation({
    mutationFn: () => templatesApi.update(id, { name, subject, category, bodyHtml, isActive }),
    onSuccess: (t) => {
      toast.success(
        t.currentVersion > (template.data?.currentVersion ?? 0)
          ? `Saved as version ${t.currentVersion}`
          : 'Saved',
      );
      qc.invalidateQueries({ queryKey: ['messaging', 'templates'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const preview = useMutation({
    mutationFn: () => templatesApi.preview(id),
    onSuccess: () => setShowPreview(true),
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const testSend = useMutation({
    mutationFn: () => templatesApi.testSend(id),
    onSuccess: (r) => toast.success(`Queued a test to ${r.to} — it will go out on the next run`),
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (template.isLoading) return <Skeleton className="h-[600px] w-full rounded-xl" />;
  if (!template.data) return <p className="text-sm text-muted-foreground">Template not found.</p>;

  /** Merge fields are inserted as text — TipTap keeps them as plain copy. */
  const insertField = async (field: string) => {
    await navigator.clipboard?.writeText(`{{${field}}}`).catch(() => undefined);
    toast.success(`{{${field}}} copied — paste it where you want it`);
  };

  return (
    <div>
      <PageHeader
        title={name || 'Template'}
        description={`Version ${template.data.currentVersion} · edited ${formatDateTime(template.data.updatedAt)}`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/messaging/templates')}>
              <ArrowLeft className="h-4 w-4" /> Library
            </Button>
            {canSend && (
              <Button variant="outline" size="sm" onClick={() => testSend.mutate()} disabled={testSend.isPending}>
                <Send className="h-4 w-4" /> Send test to me
              </Button>
            )}
            {canWrite && (
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Template name</Label>
                  <Input id="name" value={name} disabled={!canWrite} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    id="category"
                    value={category}
                    disabled={!canWrite}
                    onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject line</Label>
                <Input
                  id="subject"
                  value={subject}
                  disabled={!canWrite}
                  placeholder="Hi {{firstName}}, a quick check-in"
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={isActive}
                  disabled={!canWrite}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active — an archived template cannot be sent
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Message</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => preview.mutate()} disabled={preview.isPending}>
                <Eye className="h-4 w-4" /> Preview
              </Button>
            </CardHeader>
            <CardContent>
              {/* The same editor the blog builder uses, so there is only one
                  writing experience to learn. */}
              <TextEditor content={bodyHtml} isEditor={canWrite} onUpdate={(html) => setBodyHtml(html)} />
            </CardContent>
          </Card>

          {showPreview && preview.data && (
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  Rendered with sample data — {Object.entries(preview.data.sampleData)
                    .slice(0, 3)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">
                  <span className="text-muted-foreground">Subject: </span>
                  <span className="font-medium">{preview.data.subject || '(none)'}</span>
                </p>
                <div
                  className="rounded-lg border bg-white p-4 text-sm text-slate-800"
                  dangerouslySetInnerHTML={{ __html: preview.data.bodyHtml }}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Merge fields</CardTitle>
              <CardDescription>
                Type these into the subject or body. Each has a fallback, so a lead with no value still reads
                properly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {mergeFields.data?.map((f) => (
                <button
                  key={f.field}
                  type="button"
                  onClick={() => insertField(f.field)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
                >
                  <span>
                    <span className="font-mono text-xs text-primary">{`{{${f.field}}}`}</span>
                    <span className="ml-2 text-muted-foreground">{f.label}</span>
                  </span>
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" /> Versions
              </CardTitle>
              <CardDescription>
                Editing the wording publishes a new version. Messages already sent keep the version they went
                out with.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {template.data.versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Badge variant={v.version === template.data!.currentVersion ? 'default' : 'secondary'} className="text-[10px]">
                      v{v.version}
                    </Badge>
                    <span className="truncate text-muted-foreground">{v.subject ?? 'No subject'}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
