import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../shared/errors/AppError';
import { captureLead } from '../intake/intake.service';
import {
  chatbotClient,
  chatbotConfigured,
  type PlatformConversation,
  type PlatformLead,
  type PlatformMessage,
} from './chatbot.client';

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = (full || 'Chatbot Lead').trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || '—' };
}

// ── Mirror upserts ────────────────────────────────────
async function upsertConversation(c: PlatformConversation) {
  return prisma.chatConversation.upsert({
    where: { externalId: c.id },
    update: {
      mode: c.mode,
      waitingForHuman: c.waiting_for_human,
      assignedAgentName: c.assigned_agent_name,
      leadCaptured: c.lead_captured,
      messageCount: c.message_count,
      lastSender: c.last_sender,
      lastMessage: c.last_message,
      lastMessageAt: c.last_message_at ? new Date(c.last_message_at) : undefined,
      chatbotName: c.chatbot_name,
    },
    create: {
      externalId: c.id,
      chatbotId: c.chatbot_id,
      chatbotName: c.chatbot_name,
      sessionId: c.session_id,
      mode: c.mode,
      waitingForHuman: c.waiting_for_human,
      assignedAgentName: c.assigned_agent_name,
      leadCaptured: c.lead_captured,
      messageCount: c.message_count,
      lastSender: c.last_sender,
      lastMessage: c.last_message,
      lastMessageAt: c.last_message_at ? new Date(c.last_message_at) : undefined,
      startedAt: c.created_at ? new Date(c.created_at) : undefined,
    },
  });
}

async function ensureConversationByExternalId(externalId: string, chatbotId?: string) {
  const existing = await prisma.chatConversation.findUnique({ where: { externalId } });
  if (existing) return existing;
  return prisma.chatConversation.create({ data: { externalId, chatbotId } });
}

async function insertMessage(
  conversationId: string,
  m: { externalId?: number | null; sender: string; content: string; agentName?: string | null; sentAt?: string | Date | null },
) {
  try {
    const msg = await prisma.chatMessage.create({
      data: {
        conversationId,
        externalId: m.externalId ?? undefined,
        sender: m.sender,
        content: m.content,
        agentName: m.agentName ?? undefined,
        sentAt: m.sentAt ? new Date(m.sentAt) : new Date(),
      },
    });
    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: {
        lastSender: m.sender,
        lastMessage: m.content.slice(0, 300),
        lastMessageAt: msg.sentAt,
        messageCount: { increment: 1 },
      },
    });
    return msg;
  } catch (err) {
    // Unique (conversationId, externalId) — retried webhook delivery. Idempotent skip.
    if ((err as Prisma.PrismaClientKnownRequestError).code === 'P2002') return null;
    throw err;
  }
}

// ── Chatbot lead → CRM lead (dedupe + round-robin via intake pipeline) ──
async function ingestPlatformLead(l: PlatformLead): Promise<{ leadId: string; created: boolean }> {
  // Already ingested this platform lead?
  const byExternal = await prisma.lead.findUnique({ where: { chatbotLeadId: l.id } });
  const conv = await ensureConversationByExternalId(l.conversation_id, l.chatbot_id);

  if (byExternal) {
    if (!conv.leadId) {
      await prisma.chatConversation.update({ where: { id: conv.id }, data: { leadId: byExternal.id, leadCaptured: true } });
    }
    return { leadId: byExternal.id, created: false };
  }

  const { firstName, lastName } = splitName(l.name);
  const capture = await captureLead({
    channel: 'chatbot',
    sourceSlug: 'chatbot',
    contact: { firstName, lastName, email: l.email ?? undefined, phone: l.phone ?? undefined },
    attribution: { utmSource: 'chatbot', utmMedium: 'chat' },
    rawPayload: l,
    meta: {},
  });

  // Stamp the platform lead id (write-back key). Dedupe may have matched an
  // existing lead that already carries a different chatbot id — keep the first.
  await prisma.lead
    .update({ where: { id: capture.leadId }, data: { chatbotLeadId: l.id } })
    .catch(() => undefined);
  await prisma.chatConversation.update({
    where: { id: conv.id },
    data: { leadId: capture.leadId, leadCaptured: true },
  });
  return { leadId: capture.leadId, created: !capture.duplicate };
}

export const chatbotService = {
  configured: chatbotConfigured,

  // ── Webhook events (already signature-verified by the route) ──
  async handleEvent(event: string, data: Record<string, unknown>): Promise<void> {
    switch (event) {
      case 'ping':
        return;
      case 'lead.created':
        await ingestPlatformLead(data as unknown as PlatformLead);
        return;
      case 'message.created': {
        const conv = await ensureConversationByExternalId(
          String(data.conversation_id),
          data.chatbot_id ? String(data.chatbot_id) : undefined,
        );
        await insertMessage(conv.id, {
          externalId: Number(data.message_id),
          sender: String(data.sender),
          content: String(data.content ?? ''),
          agentName: data.agent_name ? String(data.agent_name) : null,
          sentAt: data.created_at ? String(data.created_at) : null,
        });
        return;
      }
      case 'conversation.human_requested': {
        const conv = await ensureConversationByExternalId(
          String(data.conversation_id),
          data.chatbot_id ? String(data.chatbot_id) : undefined,
        );
        await prisma.chatConversation.update({ where: { id: conv.id }, data: { waitingForHuman: true } });
        await insertMessage(conv.id, { sender: 'system', content: 'Visitor asked to talk to a human.' });
        return;
      }
      default:
        logger.warn({ event }, 'Unknown chatbot webhook event');
    }
  },

  // ── Pull sync (backfill / safety net alongside webhooks) ──
  async sync(): Promise<{ conversations: number; leads: number; newLeads: number }> {
    const [lastConv, lastLead] = await Promise.all([
      prisma.chatConversation.aggregate({ _max: { lastMessageAt: true } }),
      prisma.lead.aggregate({ where: { chatbotLeadId: { not: null } }, _max: { createdAt: true } }),
    ]);

    const convs = await chatbotClient.conversations({
      since: lastConv._max.lastMessageAt?.toISOString(),
    });
    for (const c of convs.conversations) await upsertConversation(c);

    const leads = await chatbotClient.leads({
      since: lastLead._max.createdAt?.toISOString(),
    });
    let newLeads = 0;
    for (const l of leads.leads) {
      const r = await ingestPlatformLead(l);
      if (r.created) newLeads += 1;
    }
    return { conversations: convs.conversations.length, leads: leads.leads.length, newLeads };
  },

  // Pull the full transcript for one conversation from the platform.
  async refreshTranscript(id: string) {
    const conv = await prisma.chatConversation.findUnique({ where: { id } });
    if (!conv) throw AppError.notFound('Conversation not found');
    const remote = await chatbotClient.messages(conv.externalId);
    await upsertConversation(remote.conversation);
    for (const m of remote.messages) {
      await insertMessage(conv.id, {
        externalId: m.id,
        sender: m.sender,
        content: m.content,
        agentName: m.agent_name,
        sentAt: m.created_at,
      });
    }
    // Recount accurately after backfill.
    const count = await prisma.chatMessage.count({ where: { conversationId: conv.id } });
    await prisma.chatConversation.update({ where: { id }, data: { messageCount: count } });
    return this.getConversation(id);
  },

  // ── Local reads (UI) ──
  async listConversations(params: { waiting?: boolean; leadId?: string; search?: string; limit?: number }) {
    return prisma.chatConversation.findMany({
      where: {
        ...(params.waiting ? { waitingForHuman: true } : {}),
        ...(params.leadId ? { leadId: params.leadId } : {}),
        ...(params.search
          ? {
              OR: [
                { lastMessage: { contains: params.search, mode: 'insensitive' } },
                { chatbotName: { contains: params.search, mode: 'insensitive' } },
                { lead: { firstName: { contains: params.search, mode: 'insensitive' } } },
                { lead: { lastName: { contains: params.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: [{ waitingForHuman: 'desc' }, { lastMessageAt: 'desc' }],
      take: params.limit ?? 100,
      include: { lead: { select: { id: true, firstName: true, lastName: true, status: true } } },
    });
  },

  async getConversation(id: string) {
    const conv = await prisma.chatConversation.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, status: true, chatbotLeadId: true } },
        messages: { orderBy: { sentAt: 'asc' }, take: 500 },
      },
    });
    if (!conv) throw AppError.notFound('Conversation not found');
    return conv;
  },

  // ── Live agent ──
  async takeover(id: string, agentName: string) {
    const conv = await this.getConversation(id);
    await chatbotClient.takeover(conv.externalId, agentName);
    await prisma.chatConversation.update({
      where: { id },
      data: { mode: 'human', assignedAgentName: agentName, waitingForHuman: false },
    });
    await insertMessage(id, { sender: 'system', content: `${agentName} joined the chat (AI paused).` });
    return this.getConversation(id);
  },

  async reply(id: string, text: string, agentName: string) {
    const conv = await this.getConversation(id);
    const sent = await chatbotClient.reply(conv.externalId, text, agentName);
    await insertMessage(id, { externalId: sent.id, sender: 'agent', content: text, agentName });
    return this.getConversation(id);
  },

  async release(id: string) {
    const conv = await this.getConversation(id);
    await chatbotClient.release(conv.externalId);
    await prisma.chatConversation.update({
      where: { id },
      data: { mode: 'ai', assignedAgentName: null },
    });
    await insertMessage(id, { sender: 'system', content: 'Chat handed back to the AI.' });
    return this.getConversation(id);
  },

  // Write-back: tell the platform this lead was contacted.
  async markLeadContacted(leadId: string) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null } });
    if (!lead) throw AppError.notFound('Lead not found');
    if (!lead.chatbotLeadId) throw AppError.badRequest('This lead did not come from the chatbot platform');
    await chatbotClient.markLeadContacted(lead.chatbotLeadId);
    await prisma.leadActivity.create({
      data: { leadId, type: 'SYSTEM', subject: 'Chatbot write-back', body: 'Marked as contacted on the chatbot platform.' },
    });
    return { ok: true };
  },
};
