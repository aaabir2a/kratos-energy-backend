import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Boxes, Globe, GlobeLock, Pencil, Trash2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/PageHeader';
import { catalogApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { ImageUploader } from './ImageUploader';
import type { CatalogPackage } from '@/lib/api/types';

const money = (v: string | number) => `$${Number(v).toLocaleString()}`;

const schema = z.object({
  name: z.string().min(2, 'Required'),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'lowercase, numbers, dashes'),
  power: z.string().min(1, 'Required'),
  description: z.string().optional(),
  estimatedPrice: z.coerce.number().nonnegative().optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

function PackageCard({ pkg, canWrite }: { pkg: CatalogPackage; canWrite: boolean }) {
  const qc = useQueryClient();
  const [composeOpen, setComposeOpen] = useState(false);
  const [rows, setRows] = useState<{ productId: string; quantity: number }[]>([]);

  useEffect(() => {
    setRows(pkg.products.map((p) => ({ productId: p.productId, quantity: p.quantity })));
  }, [pkg.products]);

  const allProducts = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => catalogApi.listProducts({ limit: 100 }),
    enabled: composeOpen,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['packages'] });

  const publish = useMutation({
    mutationFn: () => catalogApi.updatePackage(pkg.id, { isPublished: !pkg.isPublished }),
    onSuccess: (p) => {
      toast.success(p.isPublished ? 'Package live on website API' : 'Package hidden from website');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const compose = useMutation({
    mutationFn: () => catalogApi.setPackageProducts(pkg.id, rows.filter((r) => r.productId)),
    onSuccess: () => {
      toast.success('Package composition saved');
      setComposeOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => catalogApi.removePackage(pkg.id),
    onSuccess: () => {
      toast.success('Package deleted');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const setImage = useMutation({
    mutationFn: (url: string) => catalogApi.updatePackage(pkg.id, { imageUrl: url || null }),
    onSuccess: () => {
      toast.success('Package image updated');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>{pkg.name}</CardTitle>
          <CardDescription>
            {pkg.power} · <span className="font-mono text-xs">/public/packages/{pkg.slug}</span>
          </CardDescription>
        </div>
        {pkg.isPublished ? <Badge variant="success">Live</Badge> : <Badge variant="warning">Draft</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        {pkg.products.length ? (
          <div className="divide-y rounded-lg border text-sm">
            {pkg.products.map((pp) => (
              <div key={pp.productId} className="flex items-center justify-between p-2.5">
                <span>
                  {pp.quantity}× {pp.product.brandName}{' '}
                  <span className="text-xs text-muted-foreground">({pp.product.capacity})</span>
                </span>
                <span className="text-muted-foreground">{money(pp.product.finalPrice * pp.quantity)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No components yet — compose the package from products.</p>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Components total</span>
          <span>{money(pkg.componentsTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Website price</span>
          <span className="text-lg font-semibold text-primary">{money(pkg.displayPrice)}</span>
        </div>

        {canWrite && (
          <div className="border-t pt-3">
            <ImageUploader value={pkg.imageUrl ?? ''} onChange={(url) => setImage.mutate(url)} disabled={setImage.isPending} />
          </div>
        )}

        {canWrite && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setComposeOpen(true)}>
              <Pencil className="h-4 w-4" /> Compose
            </Button>
            <Button
              size="sm"
              variant={pkg.isPublished ? 'outline' : 'default'}
              onClick={() => publish.mutate()}
              disabled={publish.isPending}
            >
              {pkg.isPublished ? <GlobeLock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
              {pkg.isPublished ? 'Unpublish' : 'Publish'}
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove.mutate()}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Compose “{pkg.name}”</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  className="flex-1"
                  value={row.productId}
                  onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, productId: e.target.value } : r)))}
                >
                  <option value="">Select product…</option>
                  {allProducts.data?.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.brandName} ({p.capacity}) — {money(p.finalPrice)}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={1}
                  className="w-20"
                  value={row.quantity}
                  onChange={(e) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, quantity: Number(e.target.value) || 1 } : r)))}
                />
                <Button variant="ghost" size="icon" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, { productId: '', quantity: 1 }])}>
              <Plus className="h-4 w-4" /> Add product
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => compose.mutate()} disabled={compose.isPending}>
              {compose.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save composition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function PackagesPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can('catalog.write');
  const [open, setOpen] = useState(false);

  const packages = useQuery({ queryKey: ['packages'], queryFn: () => catalogApi.listPackages({ limit: 50 }) });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '', power: '', description: '', estimatedPrice: undefined, imageUrl: '' },
  });

  const create = useMutation({
    mutationFn: (v: FormValues) =>
      catalogApi.createPackage({ ...v, description: v.description || undefined, imageUrl: v.imageUrl || undefined }),
    onSuccess: () => {
      toast.success('Package created — now compose it from products');
      qc.invalidateQueries({ queryKey: ['packages'] });
      setOpen(false);
      form.reset();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const rows = packages.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Packages"
        description="Bundles built from products. Published packages are served to the main website at /api/v1/public/packages."
        action={
          canWrite && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New package
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
        <Link2 className="h-4 w-4" />
        Consumed by{' '}
        <a href="https://www.kratos-energy.com/" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
          kratos-energy.com
        </a>{' '}
        via&nbsp;
        <code className="rounded bg-background px-1.5 py-0.5 text-xs">GET /api/v1/public/products</code>&nbsp;·&nbsp;
        <code className="rounded bg-background px-1.5 py-0.5 text-xs">GET /api/v1/public/packages</code>
      </div>

      {packages.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Boxes className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No packages yet.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {rows.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} canWrite={canWrite} />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create package</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="6.6kW Residential System" {...form.register('name')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input placeholder="residential-6-6kw" {...form.register('slug')} />
                {form.formState.errors.slug && <p className="text-xs text-destructive">{form.formState.errors.slug.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Power</Label>
                <Input placeholder="6.6kW System" {...form.register('power')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea {...form.register('description')} />
            </div>
            <div className="space-y-2">
              <Label>Price override $ (optional — otherwise sum of components)</Label>
              <Input type="number" step="0.01" min={0} {...form.register('estimatedPrice')} />
            </div>
            <div className="space-y-2">
              <Label>Package image (optional)</Label>
              <ImageUploader
                value={form.watch('imageUrl')}
                onChange={(url) => form.setValue('imageUrl', url, { shouldDirty: true })}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create package
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
