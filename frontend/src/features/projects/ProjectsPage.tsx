import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Search, Hammer, Pencil, Trash2, Globe, GlobeLock, MapPin, Calendar, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { projectsApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/utils';
import { ProjectImages } from './ProjectImages';
import type { Project } from '@/lib/api/types';

interface Draft {
  title: string;
  description: string;
  location: string;
  projectDate: string;
  images: string[];
  isPublished: boolean;
}

const EMPTY: Draft = { title: '', description: '', location: '', projectDate: '', images: [], isPublished: true };

export function ProjectsPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can('projects.write');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  const projects = useQuery({
    queryKey: ['projects', { search }],
    queryFn: () => projectsApi.list({ search: search || undefined, limit: 100 }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['projects'] });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: draft.title,
        description: draft.description || null,
        location: draft.location || null,
        projectDate: draft.projectDate || null,
        images: draft.images,
        isPublished: draft.isPublished,
      };
      return editing ? projectsApi.update(editing.id, body) : projectsApi.create(body);
    },
    onSuccess: () => {
      toast.success(editing ? 'Project updated' : 'Project created');
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: () => {
      toast.success('Project deleted');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const togglePublish = useMutation({
    mutationFn: (p: Project) => projectsApi.update(p.id, { isPublished: !p.isPublished }),
    onSuccess: (p) => {
      toast.success(p.isPublished ? 'Project live on the website' : 'Project hidden from the website');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  function openCreate() {
    setEditing(null);
    setDraft(EMPTY);
    setOpen(true);
  }
  function openEdit(p: Project) {
    setEditing(p);
    setDraft({
      title: p.title,
      description: p.description ?? '',
      location: p.location ?? '',
      projectDate: p.projectDate ? p.projectDate.slice(0, 10) : '',
      images: p.images ?? [],
      isPublished: p.isPublished,
    });
    setOpen(true);
  }

  const rows = projects.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Completed installations showcased on the main website."
        action={
          canWrite && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
        <Link2 className="h-4 w-4" />
        Served to{' '}
        <a href="https://www.kratos-energy.com/" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
          kratos-energy.com
        </a>{' '}
        via&nbsp;<code className="rounded bg-background px-1.5 py-0.5 text-xs">GET /api/v1/public/projects</code>
      </div>

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search projects…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {projects.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Hammer className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="relative h-40 bg-muted">
                {p.images?.[0] ? (
                  <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground/40">
                    <Hammer className="h-8 w-8" />
                  </div>
                )}
                <div className="absolute right-2 top-2 flex gap-1.5">
                  {p.images?.length > 1 && <Badge variant="secondary">{p.images.length} photos</Badge>}
                  {p.isPublished ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Draft</Badge>}
                </div>
              </div>
              <CardContent className="space-y-2 p-4">
                <p className="font-semibold leading-tight">{p.title}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {p.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {p.location}
                    </span>
                  )}
                  {p.projectDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {formatDate(p.projectDate)}
                    </span>
                  )}
                </div>
                {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                {canWrite && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => togglePublish.mutate(p)} disabled={togglePublish.isPending}>
                      {p.isPublished ? <GlobeLock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                      {p.isPublished ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove.mutate(p.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit project' : 'New project'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Title</Label>
              <Input required placeholder="10kW rooftop solar — Wollongong" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea className="min-h-[100px]" placeholder="What was installed, and the outcome for the customer…" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input placeholder="Wollongong, NSW" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Project date</Label>
                <Input type="date" value={draft.projectDate} onChange={(e) => setDraft({ ...draft, projectDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Images</Label>
              <ProjectImages value={draft.images} onChange={(images) => setDraft({ ...draft, images })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.isPublished} onChange={(e) => setDraft({ ...draft, isPublished: e.target.checked })} />
              Published (visible on the website)
            </label>
            <DialogFooter>
              <Button type="submit" disabled={save.isPending || !draft.title}>
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Save changes' : 'Create project'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
