import { Badge } from '@/components/ui/badge';
import type { MessageStatus } from './api/messagingApi';

// Shared between the queue and the delivery log, so a status looks the same
// wherever it appears.

const STATUS: Record<MessageStatus, { label: string; variant: 'default' | 'success' | 'destructive' | 'secondary' | 'warning' }> = {
  PENDING: { label: 'Queued', variant: 'default' },
  SENDING: { label: 'Sending', variant: 'warning' },
  SENT: { label: 'Sent', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'destructive' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
  SKIPPED: { label: 'Skipped', variant: 'secondary' },
};

export function MessageStatusBadge({ status }: { status: MessageStatus }) {
  const s = STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

/** "in 3h" / "2m ago" — the queue is read as a timeline, not a set of dates. */
export function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const future = diffMs > 0;
  const mins = Math.round(Math.abs(diffMs) / 60000);
  if (mins < 1) return 'now';
  const value =
    mins < 60
      ? `${mins}m`
      : mins < 1440
        ? `${Math.round(mins / 60)}h`
        : `${Math.round(mins / 1440)}d`;
  return future ? `in ${value}` : `${value} ago`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function recipientOf(message: { toEmail: string | null; toPhone: string | null }): string {
  return message.toEmail ?? message.toPhone ?? '—';
}

/** 19 → "7:00 pm". Sending rules are set in whole hours. */
export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${suffix}`;
}
