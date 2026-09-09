import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The last screen before an irreversible send.
 *
 * Friction is proportional to reach: a handful of leads needs a clear summary
 * and a deliberate click, while a list of dozens asks the sender to type the
 * recipient count. Typing the number is the point — it cannot be done without
 * reading it, which is exactly the mistake this screen exists to catch.
 */
const TYPE_TO_CONFIRM_FROM = 20;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: number;
  skipped: { noAddress: number; unsubscribed: number };
  templateName: string;
  /** Human phrasing of when this goes out, e.g. "immediately". */
  whenLabel: string;
  /** True when quiet hours are off and this really will send at that time. */
  unrestricted: boolean;
  sending: boolean;
  onConfirm: () => void;
}

export function ConfirmSendDialog({
  open,
  onOpenChange,
  recipients,
  skipped,
  templateName,
  whenLabel,
  unrestricted,
  sending,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState('');
  const needsTyping = recipients >= TYPE_TO_CONFIRM_FROM;
  const confirmed = !needsTyping || typed.trim() === String(recipients);

  // Clear the box each time it opens, so a previous confirmation cannot be
  // reused for a different send.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const skippedTotal = skipped.noAddress + skipped.unsubscribed;

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <DialogTitle>
            Send to {recipients} {recipients === 1 ? 'person' : 'people'}?
          </DialogTitle>
          <DialogDescription>
            This cannot be undone. Once queued, the messages go out {whenLabel} and there is no recall.
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y rounded-lg border text-sm">
          <div className="flex items-baseline justify-between gap-4 px-3 py-2">
            <dt className="text-muted-foreground">Template</dt>
            <dd className="truncate font-medium">{templateName}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 px-3 py-2">
            <dt className="text-muted-foreground">Recipients</dt>
            <dd className="font-medium tabular-nums">{recipients}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 px-3 py-2">
            <dt className="text-muted-foreground">Sends</dt>
            <dd className="font-medium">{whenLabel}</dd>
          </div>
          {skippedTotal > 0 && (
            <div className="flex items-baseline justify-between gap-4 px-3 py-2">
              <dt className="text-muted-foreground">Skipped</dt>
              <dd className="text-right text-muted-foreground">
                {[
                  skipped.unsubscribed > 0 && `${skipped.unsubscribed} unsubscribed`,
                  skipped.noAddress > 0 && `${skipped.noAddress} no address`,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </dd>
            </div>
          )}
        </dl>

        {unrestricted && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            Quiet hours are switched off, so this can land overnight or at a weekend.
          </p>
        )}

        {needsTyping && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-count">
              Type <span className="font-mono font-semibold">{recipients}</span> to confirm
            </Label>
            <Input
              id="confirm-count"
              value={typed}
              inputMode="numeric"
              autoComplete="off"
              placeholder={String(recipients)}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!confirmed || sending} onClick={onConfirm}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send {recipients} {recipients === 1 ? 'email' : 'emails'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
