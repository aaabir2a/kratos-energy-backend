import { useQuery } from '@tanstack/react-query';
import { Mail, MailOpen, MousePointerClick, AlertTriangle, Clock, Bot, Ban } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';
import { historyApi, type MessageHistoryRow } from './api/messagingApi';

/**
 * What one person was sent, and what they did with it.
 *
 * Deliberately shows machine opens as machine rather than hiding them: a
 * scanner opening the mail still proves it was delivered, and a reader who
 * sees "opened" next to a message nobody read would draw the wrong conclusion.
 */
export function MessageHistory({ leadId, contactId }: { leadId?: string; contactId?: string }) {
  const history = useQuery({
    queryKey: ['messaging', 'history', leadId ?? contactId],
    queryFn: () => (leadId ? historyApi.forLead(leadId) : historyApi.forContact(contactId!)),
    enabled: Boolean(leadId || contactId),
  });

  if (history.isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  const rows = history.data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" /> Email history
        </CardTitle>
        <CardDescription>Sent by the CRM — opens and clicks are tracked.</CardDescription>
      </CardHeader>
      <CardContent>
        {!rows.length ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing has been sent yet.</p>
        ) : (
          <ol className="space-y-3">
            {rows.map((m) => (
              <HistoryRow key={m.id} message={m} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryRow({ message: m }: { message: MessageHistoryRow }) {
  const failed = m.status === 'FAILED';
  const skipped = m.status === 'SKIPPED';
  const pending = m.status === 'PENDING' || m.status === 'SENDING';

  return (
    <li className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{m.subject || '(no subject)'}</p>
        <span className="text-xs text-muted-foreground">
          {m.sentAt ? formatDate(m.sentAt) : `due ${formatDate(m.scheduledFor)}`}
        </span>
      </div>

      {m.template && <p className="mt-0.5 text-xs text-muted-foreground">{m.template.name}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {pending && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Clock className="h-3 w-3" /> Queued
          </Badge>
        )}
        {failed && (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <AlertTriangle className="h-3 w-3" /> Failed
          </Badge>
        )}
        {skipped && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Ban className="h-3 w-3" /> Skipped
          </Badge>
        )}
        {m.bounced && (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <AlertTriangle className="h-3 w-3" /> Bounced
          </Badge>
        )}
        {m.openedAt && (
          <Badge variant="success" className="gap-1 text-[10px]">
            <MailOpen className="h-3 w-3" /> Opened {formatDate(m.openedAt)}
          </Badge>
        )}
        {/* Only ever shown when no person opened it, so the two cannot be confused. */}
        {!m.openedAt && m.machineOnly && (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Bot className="h-3 w-3" /> Opened by a scanner
          </Badge>
        )}
        {m.clickedAt && (
          <Badge variant="success" className="gap-1 text-[10px]">
            <MousePointerClick className="h-3 w-3" /> Clicked
          </Badge>
        )}
      </div>

      {m.clickedUrls.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {m.clickedUrls.map((url) => (
            <li key={url} className="truncate text-xs text-muted-foreground">
              ↗ {url}
            </li>
          ))}
        </ul>
      )}

      {(m.lastError || m.skipReason) && (
        <p className="mt-2 text-xs text-muted-foreground">{m.lastError ?? m.skipReason}</p>
      )}
    </li>
  );
}
