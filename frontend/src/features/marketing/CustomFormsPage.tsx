import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, FormInput } from 'lucide-react';
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

const schema = z.object({
  formTitle: z.string().min(2, 'Required'),
  submitButtonText: z.string().max(60).optional(),
});
type FormValues = z.infer<typeof schema>;

export function CustomFormsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);

  const forms = useQuery({
    queryKey: ['custom-forms'],
    queryFn: () => marketingApi.listForms({ limit: 50 }),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { formTitle: '', submitButtonText: 'Get my free quote' },
  });

  const create = useMutation({
    mutationFn: (v: FormValues) =>
      marketingApi.createForm({
        formTitle: v.formTitle,
        submitButtonText: v.submitButtonText || 'Get my free quote',
        fieldsSchema: [
          {
            field_name: 'first_name',
            label: 'First name',
            type: 'text',
            required: true,
            maps_to: 'firstName',
          },
          {
            field_name: 'email',
            label: 'Email address',
            type: 'email',
            required: true,
            maps_to: 'email',
          },
          {
            field_name: 'phone',
            label: 'Phone number',
            type: 'phone',
            required: true,
            maps_to: 'phone',
          },
        ],
      }),
    onSuccess: (newForm) => {
      toast.success('Lead form created');
      qc.invalidateQueries({ queryKey: ['custom-forms'] });
      setOpen(false);
      form.reset();
      navigate(`/marketing/forms/${newForm.id}`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const rows = forms.data?.data ?? [];

  return (
    <div>
      <PageHeader
        title="Lead Forms"
        description="Create and manage forms independently. These forms can be embedded into static landing pages or selected for dynamic landing pages."
        action={
          can('forms.write') && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> New lead form
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create lead form</DialogTitle>
                </DialogHeader>
                <form className="space-y-4" onSubmit={form.handleSubmit((v) => create.mutate(v))}>
                  <div className="space-y-2">
                    <Label>Form Title</Label>
                    <Input placeholder="Luxury Getaway Campaign Form" {...form.register('formTitle')} />
                    {form.formState.errors.formTitle && (
                      <p className="text-xs text-destructive">{form.formState.errors.formTitle.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Submit Button Text</Label>
                    <Input placeholder="Get my free quote" {...form.register('submitButtonText')} />
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
        {forms.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <FormInput className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No lead forms yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((f) => (
                <TableRow
                  key={f.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/marketing/forms/${f.id}`)}
                >
                  <TableCell>
                    <p className="font-medium">{f.formTitle}</p>
                    <p className="text-xs text-muted-foreground">ID: {f.id}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.isActive ? 'success' : 'secondary'}>
                      {f.isActive ? 'Published' : 'Draft / Unpublished'}
                    </Badge>
                  </TableCell>
                  <TableCell>v{f.version}</TableCell>
                  <TableCell>{formatDate(f.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
