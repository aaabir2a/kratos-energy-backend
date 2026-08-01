import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Globe, Archive, Trash2, Eye, MousePointerClick, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { marketingApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';

export function LandingPageEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can('landing_pages.write');

  const page = useQuery({
    queryKey: ['landing-page', id],
    queryFn: () => marketingApi.getPage(id),
  });

  const formsQuery = useQuery({
    queryKey: ['custom-forms-dropdown'],
    queryFn: () => marketingApi.listForms({ limit: 100 }),
  });

  // Content draft state
  const [title, setTitle] = useState('');
  const [hero, setHero] = useState('');
  const [body, setBody] = useState('');
  const [thanks, setThanks] = useState('');
  const [customLeadFormId, setCustomLeadFormId] = useState<string | null>(null);

  useEffect(() => {
    if (!page.data) return;
    setTitle(page.data.title);
    setHero(page.data.heroDescription ?? '');
    setBody(page.data.detailedDescription ?? '');
    setThanks(page.data.thankYouMessage ?? '');
    setCustomLeadFormId(page.data.customLeadFormId);
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
        customLeadFormId: customLeadFormId || null,
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

  const deletePage = useMutation({
    mutationFn: () => marketingApi.removePage(id),
    onSuccess: () => {
      toast.success('Landing page deleted');
      qc.invalidateQueries({ queryKey: ['landing-pages'] });
      navigate('/marketing');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (page.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!page.data) return <p className="text-sm text-muted-foreground">Page not found.</p>;

  const p = page.data;
  const forms = formsQuery.data?.data ?? [];
  const selectedForm = forms.find((f) => f.id === customLeadFormId);

  return (
    <div>
      <button onClick={() => navigate('/marketing')} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to pages
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={p.status === 'PUBLISHED' ? 'success' : p.status === 'DRAFT' ? 'warning' : 'secondary'}>
              {p.status.charAt(0) + p.status.slice(1).toLowerCase()}
            </Badge>
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
            <Button
              variant="destructive"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this landing page?')) {
                  deletePage.mutate();
                }
              }}
              disabled={deletePage.isPending}
            >
              {deletePage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
            </Button>
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

        {/* Form Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Lead form selection</CardTitle>
            <CardDescription>Select which custom lead form is embedded in this landing page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Embedded Lead Form</Label>
              {formsQuery.isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <select
                  value={customLeadFormId || ''}
                  onChange={(e) => setCustomLeadFormId(e.target.value || null)}
                  disabled={!canWrite}
                  className="w-full border rounded-md px-3 py-1.5 text-sm bg-white"
                >
                  <option value="">-- No form (Lead form disabled) --</option>
                  {forms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.formTitle} (v{f.version}) {f.isActive ? '' : '[Inactive]'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Selected Form Preview */}
            {selectedForm ? (
              <div className="mt-6 rounded-lg border p-4 bg-muted/40">
                <div className="flex items-center justify-between border-b pb-2 mb-3">
                  <h3 className="font-semibold text-sm">{selectedForm.formTitle}</h3>
                  <span className="text-xs text-muted-foreground font-mono">v{selectedForm.version}</span>
                </div>
                <div className="space-y-2.5">
                  {selectedForm.fieldsSchema.map((f) => (
                    <div key={f.field_name} className="flex justify-between text-xs border-b border-dashed pb-1.5">
                      <span className="font-medium text-foreground">
                        {f.label} {f.required && <span className="text-destructive font-bold ml-0.5">*</span>}
                      </span>
                      <span className="text-muted-foreground font-mono">
                        [{f.type}]{f.maps_to ? ` maps to ${f.maps_to}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>Button: "{selectedForm.submitButtonText}"</span>
                  <Link to={`/marketing/forms/${selectedForm.id}`} className="text-primary hover:underline font-medium">
                    Edit Form Schema
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No form selected. Select an active lead form from the dropdown to embed it on this page.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
