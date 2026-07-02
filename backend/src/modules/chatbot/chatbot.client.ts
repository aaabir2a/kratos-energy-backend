import { env } from '../../core/config/env';
import { AppError } from '../../shared/errors/AppError';

// Thin HTTP client for the chatbot platform's CRM API (X-CRM-Key auth).
// See CRM_DEVELOPER_GUIDE.md for the contract.

export interface PlatformConversation {
  id: string;
  chatbot_id: string;
  chatbot_name: string;
  session_id: string;
  mode: 'ai' | 'human';
  waiting_for_human: boolean;
  assigned_agent_name: string | null;
  lead_captured: boolean;
  message_count: number;
  last_message: string | null;
  last_sender: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface PlatformMessage {
  id: number;
  sender: 'visitor' | 'ai' | 'agent' | 'system';
  content: string;
  agent_name: string | null;
  created_at: string;
}

export interface PlatformLead {
  id: string;
  chatbot_id: string;
  conversation_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: 'new' | 'contacted';
  created_at: string;
}

export function chatbotConfigured(): boolean {
  return Boolean(env.CHATBOT_CRM_KEY);
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!chatbotConfigured()) {
    throw new AppError('BAD_REQUEST', 'Chatbot integration is not configured — set CHATBOT_CRM_KEY in the backend .env');
  }
  let res: Response;
  try {
    res = await fetch(`${env.CHATBOT_API_BASE}${path}`, {
      method,
      headers: {
        'X-CRM-Key': env.CHATBOT_CRM_KEY,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new AppError('INTERNAL', `Chatbot platform unreachable: ${(err as Error).message}`);
  }
  if (res.status === 401) throw AppError.unauthorized('Chatbot platform rejected the CRM key (revoked or wrong)');
  if (res.status === 404) throw AppError.notFound('Not found on the chatbot platform');
  if (res.status === 409) throw AppError.conflict('Another agent already has this conversation');
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new AppError('INTERNAL', `Chatbot platform error ${res.status}: ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const chatbotClient = {
  conversations(params: { since?: string; limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams();
    if (params.since) q.set('since', params.since);
    q.set('limit', String(params.limit ?? 200));
    q.set('offset', String(params.offset ?? 0));
    return call<{ conversations: PlatformConversation[]; count: number }>('GET', `/crm/conversations?${q}`);
  },

  messages(conversationId: string) {
    return call<{ conversation: PlatformConversation; messages: PlatformMessage[] }>(
      'GET',
      `/crm/conversations/${conversationId}/messages`,
    );
  },

  leads(params: { status?: string; since?: string; limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.since) q.set('since', params.since);
    q.set('limit', String(params.limit ?? 200));
    q.set('offset', String(params.offset ?? 0));
    return call<{ leads: PlatformLead[]; count: number }>('GET', `/crm/leads?${q}`);
  },

  markLeadContacted(platformLeadId: string) {
    return call<{ id: string; status: string }>('PATCH', `/crm/leads/${platformLeadId}`, { status: 'contacted' });
  },

  takeover(conversationId: string, agentName: string) {
    return call<{ conversation_id: string; mode: string; assigned_agent_name: string }>(
      'POST',
      `/crm/conversations/${conversationId}/takeover`,
      { agent_name: agentName },
    );
  },

  reply(conversationId: string, text: string, agentName: string) {
    return call<{ id: number; conversation_id: string; sender: string }>(
      'POST',
      `/crm/conversations/${conversationId}/messages`,
      { text, agent_name: agentName },
    );
  },

  release(conversationId: string) {
    return call<{ conversation_id: string; mode: string }>('POST', `/crm/conversations/${conversationId}/release`);
  },
};
