import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Headset,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  User as UserIcon,
  Hand,
  Undo2,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/PageHeader';
import { chatApi } from '@/lib/api/endpoints';
import { apiErrorMessage } from '@/lib/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores/auth.store';
import { cn, formatDate } from '@/lib/utils';
import type { ChatMessage } from '@/lib/api/types';

function Bubble({ m }: { m: ChatMessage }) {
  if (m.sender === 'system') {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">{m.content}</span>
      </div>
    );
  }
  const mine = m.sender === 'agent' || m.sender === 'ai';
  const Icon = m.sender === 'visitor' ? UserIcon : m.sender === 'ai' ? Bot : Headset;
  return (
    <div className={cn('flex gap-2', mine ? 'flex-row-reverse' : '')}>
      <div
        className={cn(
          'mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          m.sender === 'visitor' ? 'bg-muted text-muted-foreground' : m.sender === 'ai' ? 'bg-[#6abf2e]/15 text-[#4d8f20]' : 'bg-primary/15 text-primary',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className={cn('max-w-[75%]', mine ? 'text-right' : '')}>
        <div
          className={cn(
            'inline-block rounded-2xl px-3.5 py-2 text-sm',
            m.sender === 'visitor'
              ? 'rounded-tl-sm bg-muted'
              : m.sender === 'ai'
                ? 'rounded-tr-sm bg-[#6abf2e]/10'
                : 'rounded-tr-sm bg-primary text-primary-foreground',
          )}
        >
          {m.content}
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {m.sender === 'agent' && m.agentName ? `${m.agentName} · ` : m.sender === 'ai' ? 'AI · ' : ''}
          {formatDate(m.sentAt)}
        </p>
      </div>
    </div>
  );
}

export function ChatInboxPage() {
  const { can } = usePermissions();
  const canAct = can('activities.write');
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('c');
  const [search, setSearch] = useState('');
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const status = useQuery({ queryKey: ['chat', 'status'], queryFn: () => chatApi.status() });
  const list = useQuery({
    queryKey: ['chat', 'conversations', search],
    queryFn: () => chatApi.conversations({ search: search || undefined }),
    refetchInterval: 10_000,
  });
  const conv = useQuery({
    queryKey: ['chat', 'conversation', selectedId],
    queryFn: () => chatApi.conversation(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: 4_000, // live-ish while open
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv.data?.messages?.length]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['chat', 'conversation', selectedId] });
    qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
  };

  const sync = useMutation({
    mutationFn: () => chatApi.sync(),
    onSuccess: (r) => {
      toast.success(`Synced: ${r.conversations} conversations, ${r.leads} leads (${r.newLeads} new)`);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const takeover = useMutation({
    mutationFn: () => chatApi.takeover(selectedId!),
    onSuccess: () => {
      toast.success('You are now chatting with the visitor — AI paused');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const release = useMutation({
    mutationFn: () => chatApi.release(selectedId!),
    onSuccess: () => {
      toast.success('Handed back to the AI');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const reply = useMutation({
    mutationFn: () => chatApi.reply(selectedId!, text),
    onSuccess: () => {
      setText('');
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const conversations = list.data ?? [];
  const c = conv.data;
  const isMine = c?.mode === 'human' && c.assignedAgentName === me?.firstName;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Chat Inbox"
        description="Chatbot conversations from the website — replay transcripts or take over live."
        action={
          <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync now
          </Button>
        }
      />

      {status.data && !status.data.configured && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium">Chatbot platform key not configured.</p>
            <p className="text-muted-foreground">
              Webhooks still capture leads and messages in real time, but live takeover / replies / sync need
              <code className="mx-1 rounded bg-background px-1 py-0.5 text-xs">CHATBOT_CRM_KEY</code>
              in the backend .env (generated in the platform dashboard → Integrations).
            </p>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_1fr]">
        {/* Conversation list */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search chats…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {list.isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !conversations.length ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-40" />
                <p className="text-sm">No conversations yet.</p>
                <p className="max-w-[240px] text-xs">They appear automatically when visitors chat on the website, or click Sync now.</p>
              </div>
            ) : (
              conversations.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setParams({ c: item.id })}
                  className={cn(
                    'block w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/50',
                    selectedId === item.id && 'bg-muted/70',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">
                      {item.lead ? `${item.lead.firstName} ${item.lead.lastName}` : `Visitor ${item.sessionId ?? item.externalId.slice(0, 6)}`}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      {item.waitingForHuman && (
                        <Badge variant="destructive" className="animate-pulse text-[9px]">
                          <Hand className="mr-0.5 h-2.5 w-2.5" /> Human
                        </Badge>
                      )}
                      {item.mode === 'human' ? (
                        <Badge variant="warning" className="text-[9px]">
                          <Headset className="mr-0.5 h-2.5 w-2.5" /> {item.assignedAgentName}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px]">
                          <Bot className="mr-0.5 h-2.5 w-2.5" /> AI
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {item.lastSender ? `${item.lastSender}: ` : ''}
                    {item.lastMessage ?? 'No messages yet'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {item.messageCount} messages{item.lastMessageAt ? ` · ${formatDate(item.lastMessageAt)}` : ''}
                  </p>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Transcript / live chat */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageSquare className="h-10 w-10 opacity-30" />
              <p className="text-sm">Select a conversation to replay it.</p>
            </div>
          ) : conv.isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-2/3" />
              ))}
            </div>
          ) : c ? (
            <>
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">
                    {c.lead ? (
                      <>
                        {c.lead.firstName} {c.lead.lastName}
                        <Link to={`/leads/${c.lead.id}`} className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          <Zap className="h-3 w-3" /> Open lead
                        </Link>
                      </>
                    ) : (
                      `Visitor ${c.sessionId ?? c.externalId.slice(0, 8)}`
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.chatbotName ?? 'Chatbot'} · {c.mode === 'human' ? `Live with ${c.assignedAgentName}` : 'AI answering'}
                  </p>
                </div>
                {canAct && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['chat', 'conversation', selectedId] })}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    {c.mode === 'ai' ? (
                      <Button size="sm" onClick={() => takeover.mutate()} disabled={takeover.isPending}>
                        {takeover.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Headset className="h-3.5 w-3.5" />}
                        Take over
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => release.mutate()} disabled={release.isPending}>
                        {release.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                        Hand back to AI
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {c.messages?.length ? c.messages.map((m) => <Bubble key={m.id} m={m} />) : (
                  <p className="text-center text-sm text-muted-foreground">No messages captured yet.</p>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Composer */}
              {canAct && (
                <div className="border-t p-3">
                  {c.mode === 'human' ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (text.trim()) reply.mutate();
                      }}
                    >
                      <Input
                        placeholder={isMine ? 'Reply to the visitor…' : `Replying as agent (${c.assignedAgentName} has the chat)…`}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        autoFocus
                      />
                      <Button type="submit" disabled={!text.trim() || reply.isPending}>
                        {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">
                      The AI is answering. <span className="font-medium">Take over</span> to chat with the visitor yourself.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
