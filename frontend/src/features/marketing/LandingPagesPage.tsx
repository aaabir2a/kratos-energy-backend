import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Megaphone, Eye, MousePointerClick, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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
import { marketingApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { formatDate } from '@/lib/utils';
import type { PageStatus } from '@/lib/api/types';

const STATUS_VARIANT: Record<PageStatus, 'success' | 'secondary' | 'warning'> = {
  PUBLISHED: 'success',
  DRAFT: 'warning',
  ARCHIVED: 'secondary',
};

const schema = z.object({
  title: z.string().min(2, 'Required'),
  urlSlug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'lowercase, numbers, dashes'),
  heroDescription: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function LandingPagesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);

  const pages = useQuery({ queryKey: ['landing-pages'], queryFn: () => marketingApi.listPages({ limit: 50 }) });

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { title: '', urlSlug: '', heroDescription: '' } });

  const create = useMutation({
    mutationFn: (v: FormValues) => marketingApi.createPage(v),
    onSuccess: (page) => {
      toast.success('Landing page created');
      qc.invalidateQueries({ queryKey: ['landing-pages'] });
      setOpen(false);
      form.reset();
      navigate(`/marketing/pages/${page.id}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const rows = pages.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Landing Pages"
        description="Lead-capture pages with dynamic forms. Published pages are live at /p/<slug>."
        action={
          can('landing_pages.write') && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New page
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create landing page</DialogTitle>
                </DialogHeader>
                <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input placeholder="Free Solar Quote NSW" {...form.register('title')} />
                  </div>
                  <div className="space-y-2">
                    <Label>URL slug</Label>
                    <Input placeholder="solar-quote-nsw" {...form.register('urlSlug')} />
                    {form.formState.errors.urlSlug && (
                      <p className="text-xs text-destructive">{form.formState.errors.urlSlug.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Hero description (optional)</Label>
                    <Input placeholder="Slash your power bill…" {...form.register('heroDescription')} />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={create.isPending}>
                      {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create & edit
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <Card>
        {pages.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Megaphone className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No landing pages yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
                <TableHead className="text-right">Conv. rate</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/marketing/pages/${p.id}`)}>
                  <TableCell>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">/p/{p.urlSlug}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[p.status]}>{p.status.charAt(0) + p.status.slice(1).toLowerCase()}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5 text-muted-foreground" /> {p.viewCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" /> {p.conversionCount}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {p.viewCount ? `${Math.round((p.conversionCount / p.viewCount) * 100)}%` : '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                  <TableCell>
                    {p.status === 'PUBLISHED' && (
                      <a
                        href={`/p/${p.urlSlug}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
