import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Globe, Archive, Plus, Trash2, Eye, MousePointerClick, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { marketingApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import type { FormField } from '@/lib/api/types';

const FIELD_TYPES = ['text', 'email', 'phone', 'number', 'select', 'multiselect', 'radio', 'checkbox', 'textarea', 'date'] as const;

export function LandingPageEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can('landing_pages.write');
  const canForm = can('forms.write');

  const page = useQuery({ queryKey: ['landing-page', id], queryFn: () => marketingApi.getPage(id) });

  // Content draft state
  const [title, setTitle] = useState('');
  const [hero, setHero] = useState('');
  const [body, setBody] = useState('');
  const [thanks, setThanks] = useState('');
  // Form builder draft state
  const [formTitle, setFormTitle] = useState('Get your free quote');
  const [fields, setFields] = useState<FormField[]>([]);

  useEffect(() => {
    if (!page.data) return;
    setTitle(page.data.title);
    setHero(page.data.heroDescription ?? '');
    setBody(page.data.detailedDescription ?? '');
    setThanks(page.data.thankYouMessage ?? '');
    const form = page.data.forms[0];
    if (form) {
      setFormTitle(form.formTitle);
      setFields(form.fieldsSchema);
    }
  }, [page.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['landing-page', id] });
    qc.invalidateQueries({ queryKey: ['landing-pages'] });
  };

  const savePage = useMutation({
    mutationFn: () =>
      marketingApi.updatePage(id, {
        title,
        heroDescription: hero || undefined,
        detailedDescription: body || undefined,
        thankYouMessage: thanks || undefined,
      }),
    onSuccess: () => {
      toast.success('Page saved');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => marketingApi.updatePage(id, { status }),
    onSuccess: (p) => {
      toast.success(p.status === 'PUBLISHED' ? 'Page is live 🎉' : `Page ${p.status.toLowerCase()}`);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const saveForm = useMutation({
    mutationFn: () => {
      const cleaned = fields.map((f, i) => ({
        ...f,
        order: i,
        options: ['select', 'multiselect', 'radio'].includes(f.type) ? (f.options?.length ? f.options : ['Option 1']) : undefined,
      }));
      const existing = page.data?.forms[0];
      return existing
        ? marketingApi.updateForm(existing.id, { formTitle, fieldsSchema: cleaned })
        : marketingApi.createForm(id, { formTitle, fieldsSchema: cleaned });
    },
    onSuccess: () => {
      toast.success('Form saved');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  function updateField(i: number, patch: Partial<FormField>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function addField() {
    setFields((prev) => [
      ...prev,
      { field_name: `field_${prev.length + 1}`, label: 'New field', type: 'text', required: false },
    ]);
  }
  function removeField(i: number) {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  if (page.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!page.data) return <p className="text-sm text-muted-foreground">Page not found.</p>;

  const p = page.data;
  const form = p.forms[0];

  return (
    <div>
      <button onClick={() => navigate('/marketing')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to pages
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={p.status === 'PUBLISHED' ? 'success' : p.status === 'DRAFT' ? 'warning' : 'secondary'}>{p.status}</Badge>
            <span className="text-muted-foreground">/p/{p.urlSlug}</span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Eye className="h-3.5 w-3.5" /> {p.viewCount}
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <MousePointerClick className="h-3.5 w-3.5" /> {p.conversionCount}
            </span>
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            {p.status !== 'PUBLISHED' ? (
              <Button onClick={() => setStatus.mutate('PUBLISHED')} disabled={setStatus.isPending} className="bg-emerald-600 hover:bg-emerald-600/90">
                <Globe className="h-4 w-4" /> Publish
              </Button>
            ) : (
              <>
                <Button variant="outline" asChild>
                  <a href={`/p/${p.urlSlug}`} target="_blank" rel="noreferrer">
                    <Eye className="h-4 w-4" /> View live
                  </a>
                </Button>
                <Button variant="outline" onClick={() => setStatus.mutate('ARCHIVED')} disabled={setStatus.isPending}>
                  <Archive className="h-4 w-4" /> Archive
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Content */}
        <Card>
          <CardHeader>
            <CardTitle>Page content</CardTitle>
            <CardDescription>What visitors see above and around the form.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canWrite} />
            </div>
            <div className="space-y-2">
              <Label>Hero description</Label>
              <Textarea value={hero} onChange={(e) => setHero(e.target.value)} disabled={!canWrite} />
            </div>
            <div className="space-y-2">
              <Label>Detailed description</Label>
              <Textarea className="min-h-[120px]" value={body} onChange={(e) => setBody(e.target.value)} disabled={!canWrite} />
            </div>
            <div className="space-y-2">
              <Label>Thank-you message</Label>
              <Input value={thanks} onChange={(e) => setThanks(e.target.value)} disabled={!canWrite} />
            </div>
            {canWrite && (
              <div className="flex justify-end">
                <Button onClick={() => savePage.mutate()} disabled={savePage.isPending}>
                  {savePage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save content
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Form builder */}
        <Card>
          <CardHeader>
            <CardTitle>Lead form {form && <span className="ml-1 text-xs font-normal text-muted-foreground">v{form.version}</span>}</CardTitle>
            <CardDescription>Dynamic fields validated server-side on every submission.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Form title</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} disabled={!canForm} />
            </div>

            <div className="space-y-3">
              {fields.map((f, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Input className="flex-1" placeholder="Label" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} disabled={!canForm} />
                    <Select className="w-32" value={f.type} onChange={(e) => updateField(i, { type: e.target.value as FormField['type'] })} disabled={!canForm}>
                      {FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                    {canForm && (
                      <Button variant="ghost" size="icon" onClick={() => removeField(i)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      className="w-44 font-mono text-xs"
                      placeholder="field_name"
                      value={f.field_name}
                      onChange={(e) => updateField(i, { field_name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                      disabled={!canForm}
                    />
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={f.required ?? false} onChange={(e) => updateField(i, { required: e.target.checked })} disabled={!canForm} />
                      Required
                    </label>
                    {['select', 'multiselect', 'radio'].includes(f.type) && (
                      <Input
                        className="min-w-[180px] flex-1 text-xs"
                        placeholder="Options, comma separated"
                        value={f.options?.join(', ') ?? ''}
                        onChange={(e) => updateField(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                        disabled={!canForm}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {canForm && (
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={addField}>
                  <Plus className="h-4 w-4" /> Add field
                </Button>
                <Button onClick={() => saveForm.mutate()} disabled={saveForm.isPending || !fields.length}>
                  {saveForm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {form ? 'Save form (bumps version)' : 'Create form'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
