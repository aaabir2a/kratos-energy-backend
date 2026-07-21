import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { notificationsApi } from '@/lib/api/endpoints';
import { cn } from '@/lib/utils';
import type { Notification } from '@/lib/api/types';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Poll unread count every 30s so the badge stays fresh.
  const unread = useQuery({
    queryKey: ['notif-unread'],
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });

  // Fetch the feed only while the dropdown is open.
  const feed = useQuery({
    queryKey: ['notif-feed'],
    queryFn: () => notificationsApi.list({ limit: 15 }),
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['notif-unread'] });
    qc.invalidateQueries({ queryKey: ['notif-feed'] });
  };

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: invalidate,
  });

  function openItem(n: Notification) {
    if (!n.readAt) notificationsApi.markRead(n.id).then(invalidate);
    if (n.entityType && n.entityId) {
      navigate(n.entityType === 'deal' ? `/deals/${n.entityId}` : `/leads/${n.entityId}`);
    }
    setOpen(false);
  }

  const count = unread.data ?? 0;
  const items = feed.data?.data ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative rounded-lg p-2 transition-colors hover:bg-accent" aria-label="Notifications">
          <Bell className="h-[18px] w-[18px]" />
          {count > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {count > 0 && (
            <button
              onClick={() => markAll.mutate()}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {feed.isLoading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : !items.length ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-accent',
                  !n.readAt && 'bg-primary/5',
                )}
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="text-sm font-medium leading-snug">{n.title}</span>
                  {!n.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </div>
                {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
                <span className="text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</span>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
