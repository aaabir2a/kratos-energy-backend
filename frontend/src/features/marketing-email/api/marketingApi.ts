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
