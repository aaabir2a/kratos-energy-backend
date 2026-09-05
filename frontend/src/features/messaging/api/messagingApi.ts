import { api } from '@/lib/api/client';
import type { ApiSuccess } from '@/lib/api/types';

// Feature-local API layer, following the blogs module rather than growing the
// shared endpoints file.

export type MessageChannel = 'EMAIL' | 'SMS';
export type MessageStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED' | 'SKIPPED';

export interface QueuedMessage {
  id: string;
  channel: MessageChannel;
  status: MessageStatus;
  toEmail: string | null;
  toPhone: string | null;
  subject: string | null;
  scheduledFor: string;
  sentAt: string | null;
  attempts: number;
  lastError: string | null;
  skipReason: string | null;
  providerMessageId: string | null;
  batchId: string | null;
  createdAt: string;
  lead: { id: string; firstName: string; lastName: string } | null;
  template: { id: string; name: string } | null;
}

export interface QueueSummary {
  counts: Record<'pending' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'skipped', number>;
  dueNow: number;
  nextScheduledFor: string | null;
  sentLastHour: number;
  throttlePerHour: number;
  sendingPaused: boolean;
}

export interface SendingWindow {
  quietStartHour: number;
  quietEndHour: number;
  businessDaysOnly: boolean;
  timezone: string;
}

export interface MessagingSettings {
  sendingPaused: boolean;
  sendingWindow: SendingWindow;
  throttlePerHour: number;
}

export interface TickResult {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  paused?: boolean;
  throttled?: boolean;
}

export interface QueueListParams {
  page?: number;
  limit?: number;
  status?: MessageStatus;
  channel?: MessageChannel;
  search?: string;
  dueOnly?: 'true' | 'false';
}

export const messagingApi = {
  listQueue: (params: QueueListParams) =>
    api.get<ApiSuccess<QueuedMessage[]>>('/messaging/queue', { params }).then((r) => r.data),
  queueSummary: () =>
    api.get<ApiSuccess<QueueSummary>>('/messaging/queue/summary').then((r) => r.data.data),
  getMessage: (id: string) =>
    api.get<ApiSuccess<QueuedMessage>>(`/messaging/queue/${id}`).then((r) => r.data.data),
  cancelMessage: (id: string, reason?: string) =>
    api.post<ApiSuccess<QueuedMessage>>(`/messaging/queue/${id}/cancel`, { reason }).then((r) => r.data.data),
  runNow: () => api.post<ApiSuccess<TickResult>>('/messaging/queue/run').then((r) => r.data.data),
  getSettings: () => api.get<ApiSuccess<MessagingSettings>>('/messaging/settings').then((r) => r.data.data),
  updateSettings: (body: Partial<MessagingSettings>) =>
    api.put<ApiSuccess<MessagingSettings>>('/messaging/settings', body).then((r) => r.data.data),
};
