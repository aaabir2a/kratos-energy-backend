import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Loader2, MailX, Check, Undo2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { ApiSuccess } from '@/lib/api/types';
import { Button } from '@/components/ui/button';

// Public page — no login, no layout, reached only from an email footer.
// Everything here has to work for someone who has never seen the CRM.

interface UnsubscribeState {
  address: string;
  channel: 'EMAIL' | 'SMS';
  unsubscribed: boolean;
}

const unsubscribeApi = {
  get: (token: string) =>
    api.get<ApiSuccess<UnsubscribeState>>(`/public/unsubscribe/${token}`).then((r) => r.data.data),
  unsubscribe: (token: string) =>
    api.post<ApiSuccess<UnsubscribeState>>(`/public/unsubscribe/${token}`).then((r) => r.data.data),
  resubscribe: (token: string) =>
    api
      .post<ApiSuccess<UnsubscribeState>>(`/public/unsubscribe/${token}/resubscribe`)
      .then((r) => r.data.data),
};

export function UnsubscribePage() {
  const { token = '' } = useParams();
  const qc = useQueryClient();

  const state = useQuery({
    queryKey: ['unsubscribe', token],
    queryFn: () => unsubscribeApi.get(token),
    retry: false,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['unsubscribe', token] });
  const unsubscribe = useMutation({ mutationFn: () => unsubscribeApi.unsubscribe(token), onSuccess: invalidate });
  const resubscribe = useMutation({ mutationFn: () => unsubscribeApi.resubscribe(token), onSuccess: invalidate });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <img src="/logo.svg" alt="" className="h-7 w-7" />
          <span className="font-semibold">
            Kratos <span className="text-[#6abf2e]">Sustainability</span>
          </span>
        </div>

        {state.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your link…
          </p>
        )}

        {state.isError && (
          <div className="space-y-2">
            <h1 className="text-lg font-semibold">This link is not valid</h1>
            <p className="text-sm text-muted-foreground">
              It may have been copied incompletely. Email{' '}
              <a href="mailto:info@kratos-energy.com" className="text-primary hover:underline">
                info@kratos-energy.com
              </a>{' '}
              and we will take you off the list by hand.
            </p>
          </div>
        )}

        {state.data && !state.data.unsubscribed && (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold">Unsubscribe from Kratos emails?</h1>
            <p className="text-sm text-muted-foreground">
              We will stop sending marketing and follow-up email to{' '}
              <span className="font-medium text-foreground">{state.data.address}</span>. Anything already
              queued for you is cancelled too.
            </p>
            <p className="text-sm text-muted-foreground">
              You will still hear from us about a job already booked or in progress.
            </p>
            <Button
              className="w-full"
              onClick={() => unsubscribe.mutate()}
              disabled={unsubscribe.isPending}
            >
              {unsubscribe.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailX className="h-4 w-4" />}
              Unsubscribe
            </Button>
          </div>
        )}

        {state.data?.unsubscribed && (
          <div className="space-y-4">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Check className="h-5 w-5 text-[#6abf2e]" /> You are unsubscribed
            </h1>
            <p className="text-sm text-muted-foreground">
              No more marketing or follow-up email will be sent to{' '}
              <span className="font-medium text-foreground">{state.data.address}</span>.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => resubscribe.mutate()}
              disabled={resubscribe.isPending}
            >
              {resubscribe.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Changed your mind? Resubscribe
            </Button>
          </div>
        )}

        <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          Kratos Sustainability ·{' '}
          <a href="https://www.kratos-energy.com" className="hover:underline">
            kratos-energy.com
          </a>{' '}
          · 1300 089 547
        </p>
      </div>
    </div>
  );
}
