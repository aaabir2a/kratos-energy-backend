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

// ── Templates (Stage 3) ───────────────────────────────

export type TemplateCategory = 'REFERRAL' | 'FOLLOW_UP' | 'AFTERCARE' | 'QUOTE' | 'TRANSACTIONAL' | 'OTHER';

export interface MessageTemplateRow {
  id: string;
  key: string | null;
  name: string;
  category: TemplateCategory;
  channel: MessageChannel;
  subject: string | null;
  currentVersion: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate extends MessageTemplateRow {
  bodyHtml: string;
  bodyText: string | null;
  versions: { id: string; version: number; subject: string | null; createdAt: string }[];
}

export interface MergeField {
  field: string;
  label: string;
  fallback: string;
}

export interface TemplatePreview {
  subject: string | null;
  bodyHtml: string;
  bodyText: string | null;
  sampleData: Record<string, string>;
}

export interface SendFilters {
  stageId?: string;
  status?: string;
  enquiryType?: string;
  leadSourceId?: string;
  search?: string;
}

export interface SendScreening {
  total: number;
  willSend: number;
  skipped: { noAddress: number; unsubscribed: number };
}

export interface SendPreview {
  template: { id: string; name: string; category: TemplateCategory };
  screening: SendScreening;
  cap: number | null;
  sample: { to: string | null; leadName: string; subject: string; bodyHtml: string } | null;
}

export interface SendResult {
  batchId: string;
  queued: number;
  duplicates: number;
  skipped: { noAddress: number; unsubscribed: number };
  scheduledFor: string;
}

export interface TemplateListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: TemplateCategory;
  isActive?: 'true' | 'false';
}

export const templatesApi = {
  list: (params: TemplateListParams) =>
    api.get<ApiSuccess<MessageTemplateRow[]>>('/messaging/templates', { params }).then((r) => r.data),
  get: (id: string) =>
    api.get<ApiSuccess<MessageTemplate>>(`/messaging/templates/${id}`).then((r) => r.data.data),
  create: (body: Partial<MessageTemplate>) =>
    api.post<ApiSuccess<MessageTemplate>>('/messaging/templates', body).then((r) => r.data.data),
  update: (id: string, body: Partial<MessageTemplate>) =>
    api.patch<ApiSuccess<MessageTemplate>>(`/messaging/templates/${id}`, body).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/messaging/templates/${id}`),
  duplicate: (id: string) =>
    api.post<ApiSuccess<MessageTemplate>>(`/messaging/templates/${id}/duplicate`).then((r) => r.data.data),
  preview: (id: string) =>
    api.get<ApiSuccess<TemplatePreview>>(`/messaging/templates/${id}/preview`).then((r) => r.data.data),
  testSend: (id: string) =>
    api
      .post<ApiSuccess<{ messageId: string; to: string }>>(`/messaging/templates/${id}/test-send`)
      .then((r) => r.data.data),
  mergeFields: () =>
    api.get<ApiSuccess<MergeField[]>>('/messaging/merge-fields').then((r) => r.data.data),
};

export const sendApi = {
  preview: (body: { templateId: string; leadIds?: string[]; filters?: SendFilters }) =>
    api.post<ApiSuccess<SendPreview>>('/messaging/send/preview', body).then((r) => r.data.data),
  send: (body: {
    templateId: string;
    leadIds?: string[];
    filters?: SendFilters;
    scheduledFor?: string;
    name?: string;
  }) => api.post<ApiSuccess<SendResult>>('/messaging/send', body).then((r) => r.data.data),
};
