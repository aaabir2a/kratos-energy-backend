import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Search, PackageOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
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
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/PageHeader';
import { catalogApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { ImageUploader } from './ImageUploader';
import type { Product } from '@/lib/api/types';

const schema = z.object({
  category: z.string().min(1, 'Required'),
  brandName: z.string().min(1, 'Required'),
  capacity: z.string().min(1, 'Required').max(200, 'Max 200 characters'),
  stock: z.coerce.number().int().min(0),
  basePrice: z.coerce.number().nonnegative(),
  stateRebate: z.coerce.number().nonnegative(),
  federalRebate: z.coerce.number().nonnegative(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  officialUrl: z.string().url().optional().or(z.literal('')),
});
type FormValues = z.infer<typeof schema>;

const money = (v: string | number) => `$${Number(v).toLocaleString()}`;

export function ProductsPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canWrite = can('catalog.write');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const products = useQuery({
    queryKey: ['products', { search, category }],
    queryFn: () => catalogApi.listProducts({ search: search || undefined, category: category || undefined, limit: 100 }),
  });
  const categories = useQuery({ queryKey: ['product-categories'], queryFn: () => catalogApi.categories() });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { category: '', brandName: '', capacity: '', stock: 0, basePrice: 0, stateRebate: 0, federalRebate: 0, imageUrl: '', officialUrl: '' },
  });

  function openCreate() {
    setEditing(null);
    form.reset({ category: '', brandName: '', capacity: '', stock: 0, basePrice: 0, stateRebate: 0, federalRebate: 0, imageUrl: '', officialUrl: '' });
    setOpen(true);
  }
  function openEdit(p: Product) {
    setEditing(p);
    form.reset({
      category: p.category,
      brandName: p.brandName,
      capacity: p.capacity,
      stock: p.stock,
      basePrice: Number(p.basePrice),
      stateRebate: Number(p.stateRebate),
      federalRebate: Number(p.federalRebate),
      imageUrl: p.imageUrl ?? '',
      officialUrl: p.officialUrl ?? '',
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const officialUrl = v.officialUrl || undefined;
      return editing
        ? catalogApi.updateProduct(editing.id, { ...v, imageUrl: v.imageUrl || null, officialUrl })
        : catalogApi.createProduct({ ...v, imageUrl: v.imageUrl || undefined, officialUrl });
    },
    onSuccess: () => {
      toast.success(editing ? 'Product updated' : 'Product created');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['product-categories'] });
      setOpen(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => catalogApi.removeProduct(id),
    onSuccess: () => {
      toast.success('Product deleted');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const toggleActive = useMutation({
    mutationFn: (p: Product) => catalogApi.updateProduct(p.id, { isActive: !p.isActive }),
    onSuccess: () => {
      toast.success('Product updated');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const rows = products.data?.data ?? [];
  const watchBase = form.watch('basePrice');
  const watchState = form.watch('stateRebate');
  const watchFed = form.watch('federalRebate');
  const livePrice = Math.max(0, Number(watchBase || 0) - Number(watchState || 0) - Number(watchFed || 0));

  return (
    <div>
      <PageHeader
        title="Products"
        description="Catalog shown on the main website via the public API. Prices are net of rebates."
        action={
          canWrite && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> New product
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search products…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto min-w-[160px]">
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {products.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <PackageOpen className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No products yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Rebates</TableHead>
                <TableHead className="text-right">Final price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Status</TableHead>
                {canWrite && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded border object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border bg-muted/40 text-muted-foreground/40">
                          <PackageOpen className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{p.brandName}</p>
                        <p className="text-xs text-muted-foreground">{p.capacity}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{money(p.basePrice)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    −{money(Number(p.stateRebate) + Number(p.federalRebate))}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{money(p.finalPrice)}</TableCell>
                  <TableCell className="text-right">{p.stock}</TableCell>
                  <TableCell>
                    {p.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Hidden</Badge>}
                  </TableCell>
                  {canWrite && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive.mutate(p)}>
                            {p.isActive ? 'Hide from website' : 'Show on website'}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => remove.mutate(p.id)}>
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit product' : 'New product'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input placeholder="Solar Panel" list="cat-list" {...form.register('category')} />
                <datalist id="cat-list">
                  {categories.data?.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Brand / model</Label>
                <Input placeholder="Jinko Tiger Neo" {...form.register('brandName')} />
              </div>
              <div className="space-y-2">
                <Label>Capacity</Label>
                <Input placeholder="440W" {...form.register('capacity')} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>Base price $</Label>
                <Input type="number" step="0.01" min={0} {...form.register('basePrice')} />
              </div>
              <div className="space-y-2">
                <Label>State rebate $</Label>
                <Input type="number" step="0.01" min={0} {...form.register('stateRebate')} />
              </div>
              <div className="space-y-2">
                <Label>Federal rebate $</Label>
                <Input type="number" step="0.01" min={0} {...form.register('federalRebate')} />
              </div>
              <div className="space-y-2">
                <Label>Stock</Label>
                <Input type="number" min={0} {...form.register('stock')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Product image (optional)</Label>
              <ImageUploader
                value={form.watch('imageUrl')}
                onChange={(url) => form.setValue('imageUrl', url, { shouldDirty: true })}
                disabled={!canWrite}
              />
            </div>
            <div className="space-y-2">
              <Label>Official URL (optional)</Label>
              <Input {...form.register('officialUrl')} />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-primary/10 px-4 py-2.5">
              <span className="text-sm font-medium text-primary">Final price (base − rebates)</span>
              <span className="text-lg font-semibold text-primary">{money(livePrice)}</span>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Save changes' : 'Create product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
