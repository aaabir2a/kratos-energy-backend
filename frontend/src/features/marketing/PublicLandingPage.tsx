import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { marketingApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import type { FormField } from '@/lib/api/types';

const AU_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

function DynamicField({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
}) {
  const common = { id: field.field_name, placeholder: field.placeholder };
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.field_name}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      {field.type === 'textarea' ? (
        <Textarea {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === 'select' || field.type === 'radio' ? (
        <Select {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : field.type === 'checkbox' ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.help_text ?? 'Yes'}
        </label>
      ) : (
        <Input
          {...common}
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'}
          value={(value as string | number) ?? ''}
          onChange={(e) => onChange(field.type === 'number' ? e.target.valueAsNumber : e.target.value)}
        />
      )}
      {field.help_text && field.type !== 'checkbox' && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function PublicLandingPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const [contact, setContact] = useState({ firstName: '', lastName: '', email: '', phone: '', suburb: '', state: '', postcode: '' });
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const page = useQuery({ queryKey: ['public-page', slug], queryFn: () => marketingApi.publicPage(slug), retry: false });

  const submit = useMutation({
    mutationFn: () =>
      marketingApi.publicSubmit({
        ...contact,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        state: contact.state || undefined,
        landingPageSlug: slug,
        customFields: custom,
        consentMarketing: true,
        // Attribution straight off the URL.
        utmSource: params.get('utm_source') ?? undefined,
        utmMedium: params.get('utm_medium') ?? undefined,
        utmCampaign: params.get('utm_campaign') ?? undefined,
        utmTerm: params.get('utm_term') ?? undefined,
        utmContent: params.get('utm_content') ?? undefined,
        gclid: params.get('gclid') ?? undefined,
        fbclid: params.get('fbclid') ?? undefined,
        referrerUrl: document.referrer || undefined,
      }),
    onSuccess: () => {
      setFieldErrors({});
      const redirect = page.data?.redirectUrl;
      if (redirect) window.location.assign(redirect);
      else setDone(true);
    },
    onError: (e: unknown) => {
      // Surface per-field validation errors from the engine.
      const details = (e as { response?: { data?: { error?: { details?: { fields?: { field: string; message: string }[] } } } } })
        ?.response?.data?.error?.details;
      if (details?.fields) {
        setFieldErrors(Object.fromEntries(details.fields.map((f) => [f.field, f.message])));
      } else {
        setFieldErrors({ _global: apiErrorMessage(e) });
      }
    },
  });

  if (page.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!page.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
        <img src="/logo.svg" alt="Kratos Sustainability" className="h-12 w-auto" />
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">This page may have been unpublished.</p>
      </div>
    );
  }

  const p = page.data;
  const form = p.forms[0];
  const sortedFields = form ? [...form.fieldsSchema].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="bg-sidebar text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2.5 px-6 py-4">
          <div className="rounded-lg bg-white p-1">
            <img src="/logo.svg" alt="Kratos Sustainability" className="h-9 w-auto" />
          </div>
          <span className="font-bold uppercase tracking-wide">
            <span className="text-[#6abf2e]">Kratos</span> <span className="text-white">Sustainability</span>
          </span>
        </div>
        <div className="mx-auto max-w-5xl px-6 pb-14 pt-8">
          <h1 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">{p.title}</h1>
          {p.heroDescription && <p className="mt-3 max-w-xl text-white/75">{p.heroDescription}</p>}
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-6 py-10 lg:grid-cols-2">
        {/* Body copy */}
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          {p.detailedDescription ? (
            <p className="whitespace-pre-line">{p.detailedDescription}</p>
          ) : (
            <>
              <p>✔ CEC-accredited installers</p>
              <p>✔ Federal + state rebates handled for you</p>
              <p>✔ 25-year panel performance warranty</p>
            </>
          )}
        </div>

        {/* Form */}
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <h2 className="text-lg font-semibold">{p.thankYouMessage ?? 'Thanks! We will be in touch shortly.'}</h2>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit.mutate();
              }}
            >
              <h2 className="text-lg font-semibold">{form?.formTitle ?? 'Get your free quote'}</h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>First name *</Label>
                  <Input required value={contact.firstName} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Last name</Label>
                  <Input value={contact.lastName} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input type="email" required value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Suburb</Label>
                  <Input value={contact.suburb} onChange={(e) => setContact({ ...contact, suburb: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Select value={contact.state} onChange={(e) => setContact({ ...contact, state: e.target.value })}>
                    <option value="">—</option>
                    {AU_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Postcode</Label>
                  <Input value={contact.postcode} onChange={(e) => setContact({ ...contact, postcode: e.target.value })} />
                </div>
              </div>

              {sortedFields.map((f) => (
                <DynamicField
                  key={f.field_name}
                  field={f}
                  value={custom[f.field_name]}
                  error={fieldErrors[f.field_name]}
                  onChange={(v) => setCustom((prev) => ({ ...prev, [f.field_name]: v }))}
                />
              ))}

              {/* Honeypot */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

              {fieldErrors._global && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{fieldErrors._global}</p>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={submit.isPending}>
                {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {form?.submitButtonText ?? 'Get my free quote'}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                By submitting you agree to be contacted about solar products. We respect your privacy.
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
