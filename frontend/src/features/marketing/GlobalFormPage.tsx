import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Save, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { marketingApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import type { FormField } from '@/lib/api/types';

const FIELD_TYPES = ['text', 'email', 'phone', 'number', 'select', 'multiselect', 'radio', 'checkbox', 'textarea', 'date'] as const;

// Shared global lead form used by the home + contact pages on kratos-energy.com.
// Fields edited here are validated server-side on every public submission and
// delivered to the website via GET /public/lead-form.
export function GlobalFormPage() {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canForm = can('forms.write');

  const globalForm = useQuery({ queryKey: ['global-form'], queryFn: () => marketingApi.getGlobalForm() });

  const [formTitle, setFormTitle] = useState('Get in touch');
  const [submitText, setSubmitText] = useState('Send enquiry');
  const [fields, setFields] = useState<FormField[]>([]);

  useEffect(() => {
    const form = globalForm.data;
    if (!form) return;
    setFormTitle(form.formTitle);
    setSubmitText(form.submitButtonText);
    setFields(form.fieldsSchema);
  }, [globalForm.data]);

  const save = useMutation({
    mutationFn: () => {
      const cleaned = fields.map((f, i) => ({
        ...f,
        order: i,
        options: ['select', 'multiselect', 'radio'].includes(f.type) ? (f.options?.length ? f.options : ['Option 1']) : undefined,
      }));
      return marketingApi.saveGlobalForm({ formTitle, submitButtonText: submitText, fieldsSchema: cleaned });
    },
    onSuccess: () => {
      toast.success('Global form saved — live on kratos-energy.com');
      qc.invalidateQueries({ queryKey: ['global-form'] });
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

  if (globalForm.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;

  const existing = globalForm.data;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Website lead form</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The shared form shown on the home and contact pages of{' '}
          <a href="https://www.kratos-energy.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <Globe className="h-3.5 w-3.5" /> kratos-energy.com
          </a>
          . Every submission is captured as a lead.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Fields {existing && <span className="ml-1 text-xs font-normal text-muted-foreground">v{existing.version}</span>}
          </CardTitle>
          <CardDescription>Dynamic fields validated server-side on every submission.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Form title</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} disabled={!canForm} />
            </div>
            <div className="space-y-2">
              <Label>Submit button text</Label>
              <Input value={submitText} onChange={(e) => setSubmitText(e.target.value)} disabled={!canForm} />
            </div>
          </div>

          <div className="space-y-3">
            {fields.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No fields yet. Add the fields visitors should fill in.
              </p>
            )}
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
              <Button onClick={() => save.mutate()} disabled={save.isPending || !fields.length}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {existing ? 'Save form (bumps version)' : 'Publish form'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
