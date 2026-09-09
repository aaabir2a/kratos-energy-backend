import { api } from '@/lib/api/client';
import type { ApiSuccess } from '@/lib/api/types';

// Feature-local API layer, following the blogs and messaging modules.

export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  customColumns: string[];
  createdAt: string;
  updatedAt: string;
  _count: { members: number };
}

export interface MarketingContact {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  customData: Record<string, string>;
  /** Set when this address is also a lead in the CRM. */
  leadId: string | null;
  createdAt: string;
  /** On the do-not-contact list — cannot be emailed. */
  suppressed: boolean;
}

export interface ListHealth {
  total: number;
  sendable: number;
  suppressed: number;
  removed: number;
}

export type ColumnRole = 'email' | 'firstName' | 'lastName' | 'custom' | 'ignore';

export interface ImportPreview {
  headers: string[];
  suggested: Record<string, Exclude<ColumnRole, 'ignore'>>;
  sampleRows: Record<string, string>[];
  totalRows: number;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: { invalidEmail: number; duplicateInFile: number; suppressed: number };
  rejectedExamples: { row: number; value: string; reason: string }[];
}

export const listsApi = {
  list: (params: { page?: number; limit?: number; search?: string }) =>
    api.get<ApiSuccess<ContactList[]>>('/marketing-email/lists', { params }).then((r) => r.data),
  get: (id: string) =>
    api.get<ApiSuccess<ContactList>>(`/marketing-email/lists/${id}`).then((r) => r.data.data),
  health: (id: string) =>
    api.get<ApiSuccess<ListHealth>>(`/marketing-email/lists/${id}/health`).then((r) => r.data.data),
  create: (body: { name: string; description?: string }) =>
    api.post<ApiSuccess<ContactList>>('/marketing-email/lists', body).then((r) => r.data.data),
  update: (id: string, body: { name?: string; description?: string }) =>
    api.patch<ApiSuccess<ContactList>>(`/marketing-email/lists/${id}`, body).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/marketing-email/lists/${id}`),
  removeContacts: (id: string, contactIds: string[]) =>
    api.delete(`/marketing-email/lists/${id}/contacts`, { data: { contactIds } }),
};

export const contactsApi = {
  list: (params: { page?: number; limit?: number; search?: string; listId?: string; suppressedOnly?: 'true' }) =>
    api.get<ApiSuccess<MarketingContact[]>>('/marketing-email/contacts', { params }).then((r) => r.data),
  create: (body: { email: string; firstName?: string; lastName?: string; listIds?: string[] }) =>
    api.post<ApiSuccess<MarketingContact>>('/marketing-email/contacts', body).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/marketing-email/contacts/${id}`),
};

export const importApi = {
  preview: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<ApiSuccess<ImportPreview>>('/marketing-email/import/preview', form)
      .then((r) => r.data.data);
  },
  run: (file: File, listId: string, mapping: Record<string, ColumnRole>) => {
    const form = new FormData();
    form.append('file', file);
    form.append('mapping', JSON.stringify({ listId, mapping }));
    return api.post<ApiSuccess<ImportResult>>('/marketing-email/import', form).then((r) => r.data.data);
  },
};

// ── Campaigns ─────────────────────────────────────────

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED';

export interface CampaignProgress {
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
  cancelled: number;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  templateId: string | null;
  batchId: string | null;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  recipientCount: number;
  skippedCount: number;
  createdAt: string;
  template: { id: string; name: string; subject: string | null; isActive: boolean } | null;
  lists: { list: { id: string; name: string } }[];
  progress: CampaignProgress | null;
}

export interface CampaignPreview {
  campaign: { id: string; name: string; status: CampaignStatus };
  template: { id: string; name: string };
  screening: {
    total: number;
    willSend: number;
    skipped: { noAddress: number; unsubscribed: number; duplicate: number };
  };
  sample: { to: string; name: string; subject: string; bodyHtml: string } | null;
}

export const campaignsApi = {
  list: (params: { page?: number; limit?: number; status?: CampaignStatus }) =>
    api.get<ApiSuccess<Campaign[]>>('/marketing-email/campaigns', { params }).then((r) => r.data),
  get: (id: string) =>
    api.get<ApiSuccess<Campaign>>(`/marketing-email/campaigns/${id}`).then((r) => r.data.data),
  preview: (id: string) =>
    api.get<ApiSuccess<CampaignPreview>>(`/marketing-email/campaigns/${id}/preview`).then((r) => r.data.data),
  create: (body: { name: string; templateId?: string; listIds?: string[] }) =>
    api.post<ApiSuccess<Campaign>>('/marketing-email/campaigns', body).then((r) => r.data.data),
  update: (id: string, body: { name?: string; templateId?: string | null; listIds?: string[] }) =>
    api.patch<ApiSuccess<Campaign>>(`/marketing-email/campaigns/${id}`, body).then((r) => r.data.data),
  send: (id: string, scheduledFor?: string) =>
    api
      .post<ApiSuccess<Campaign & { queued: number }>>(`/marketing-email/campaigns/${id}/send`, { scheduledFor })
      .then((r) => r.data.data),
  cancel: (id: string) =>
    api.post<ApiSuccess<{ cancelled: number }>>(`/marketing-email/campaigns/${id}/cancel`).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/marketing-email/campaigns/${id}`),
};
