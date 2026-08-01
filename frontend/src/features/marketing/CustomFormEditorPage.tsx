import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Save, ArrowLeft, ToggleLeft, ToggleRight } from 'lucide-react';
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

const MAP_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Custom field (extra)' },
  { value: 'firstName', label: 'Core: First name' },
  { value: 'lastName', label: 'Core: Last name' },
  { value: 'email', label: 'Core: Email' },
  { value: 'phone', label: 'Core: Phone' },
  { value: 'suburb', label: 'Core: Suburb' },
  { value: 'state', label: 'Core: State' },
  { value: 'postcode', label: 'Core: Postcode' },
];

export function CustomFormEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canForm = can('forms.write');

  const formQuery = useQuery({
    queryKey: ['custom-form', id],
    queryFn: () => marketingApi.getForm(id),
    enabled: !!id,
  });

  const [formTitle, setFormTitle] = useState('');
  const [submitText, setSubmitText] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [fields, setFields] = useState<FormField[]>([]);
  const [optionsText, setOptionsText] = useState<Record<number, string>>({});

  useEffect(() => {
    const f = formQuery.data;
    if (!f) return;
    setFormTitle(f.formTitle);
    setSubmitText(f.submitButtonText);
    setIsActive(f.isActive);
    setFields(f.fieldsSchema);
    setOptionsText({});
  }, [formQuery.data]);

  const save = useMutation({
    mutationFn: () => {
      const cleaned = fields.map((f, i) => ({
        ...f,
        order: i,
        maps_to: f.maps_to || undefined,
        options: ['select', 'multiselect', 'radio'].includes(f.type) ? (f.options?.length ? f.options : ['Option 1']) : undefined,
      }));
      return marketingApi.updateForm(id, {
        formTitle,
        submitButtonText: submitText,
        isActive,
        fieldsSchema: cleaned,
      });
    },
    onSuccess: () => {
      toast.success('Form saved successfully');
      qc.invalidateQueries({ queryKey: ['custom-form', id] });
      qc.invalidateQueries({ queryKey: ['custom-forms'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const deleteForm = useMutation({
    mutationFn: () => marketingApi.removeForm(id),
    onSuccess: () => {
      toast.success('Lead form deleted');
      qc.invalidateQueries({ queryKey: ['custom-forms'] });
      navigate('/marketing/forms');
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
    setOptionsText((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const idx = Number(k);
        if (idx < i) next[idx] = v;
        else if (idx > i) next[idx - 1] = v;
      }
      return next;
    });
  }

  function setOptions(i: number, raw: string) {
    setOptionsText((prev) => ({ ...prev, [i]: raw }));
    updateField(i, { options: raw.split(',').map((s) => s.trim()).filter(Boolean) });
  }

  if (formQuery.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (formQuery.isError || !formQuery.data) {
    return (
      <div className="p-6 text-center">
        <p className="text-destructive font-semibold">Error loading lead form.</p>
        <Link to="/marketing/forms" className="text-primary hover:underline mt-2 inline-block">
          Back to list
        </Link>
      </div>
    );
  }

  const existing = formQuery.data;
  const hasFirstName = fields.some((f) => f.maps_to === 'firstName' && f.required);
  const hasContact = fields.some((f) => f.maps_to === 'email' || f.maps_to === 'phone');
  const mappingOk = hasFirstName && hasContact;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link to="/marketing/forms" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="h-3 w-3" /> Lead Forms
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{formTitle || 'Edit Lead Form'}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Form ID: <span className="font-mono">{id}</span>
          </p>
        </div>
        {canForm && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsActive(!isActive)}
                className="flex items-center gap-1.5 text-xs"
              >
                {isActive ? (
                  <>
                    <ToggleRight className="h-4 w-4 text-emerald-500" /> Published
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-4 w-4 text-muted-foreground" /> Draft / Inactive
                  </>
                )}
              </Button>
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !mappingOk} className="gap-1.5">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Form
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this lead form? This will remove it from any landing pages using it.')) {
                  deleteForm.mutate();
                }
              }}
              disabled={deleteForm.isPending}
              className="gap-1.5"
            >
              {deleteForm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete Form
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Form Settings <span className="ml-1 text-xs font-normal text-muted-foreground">v{existing.version}</span>
          </CardTitle>
          <CardDescription>Configure fields, types, button labels, and backend destination mappings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Form Title / Heading</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} disabled={!canForm} />
            </div>
            <div className="space-y-2">
              <Label>Submit Button Text</Label>
              <Input value={submitText} onChange={(e) => setSubmitText(e.target.value)} disabled={!canForm} />
            </div>
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Lead field mapping</p>
            <p className="mt-0.5">
              Set "Maps to" on details that should populate standard Lead columns in the CRM. Required to save:{' '}
              <span className={hasFirstName ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                a required "First name" field
              </span>{' '}
              and{' '}
              <span className={hasContact ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                an Email or Phone field
              </span>
              . Extra fields will be saved under custom responses.
            </p>
          </div>

          <div className="space-y-3">
            {fields.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No fields defined. Click below to add form fields.
              </p>
            )}
            {fields.map((f, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3 bg-card">
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Field Label (e.g. Roof Material)"
                    value={f.label}
                    onChange={(e) => updateField(i, { label: e.target.value })}
                    disabled={!canForm}
                  />
                  <Select
                    className="w-32"
                    value={f.type}
                    onChange={(e) => updateField(i, { type: e.target.value as FormField['type'] })}
                    disabled={!canForm}
                  >
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
                    className="w-40 font-mono text-xs"
                    placeholder="field_name"
                    value={f.field_name}
                    onChange={(e) => updateField(i, { field_name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                    disabled={!canForm}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Maps to
                    <Select
                      className="h-8 w-auto min-w-[130px] text-xs"
                      value={f.maps_to ?? ''}
                      onChange={(e) => updateField(i, { maps_to: (e.target.value || undefined) as FormField['maps_to'] })}
                      disabled={!canForm}
                    >
                      {MAP_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => updateField(i, { required: e.target.checked })}
                      disabled={!canForm}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    Required field
                  </label>
                </div>

                {['select', 'multiselect', 'radio'].includes(f.type) && (
                  <div className="mt-2 space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Options (comma-separated)</Label>
                    <Input
                      placeholder="Option 1, Option 2, Option 3"
                      value={optionsText[i] !== undefined ? optionsText[i] : (f.options ?? []).join(', ')}
                      onChange={(e) => setOptions(i, e.target.value)}
                      disabled={!canForm}
                      className="text-xs"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {canForm && (
            <Button variant="outline" size="sm" onClick={addField} className="w-full">
              <Plus className="h-4 w-4" /> Add Field
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
