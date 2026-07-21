import { api } from './client';
import type {
  ApiSuccess,
  AuthResult,
  AuthUser,
  CampaignRow,
  CatalogPackage,
  ChatConversation,
  Deal,
  DealItem,
  DealStats,
  LandingPage,
  Lead,
  LeadActivity,
  LeadAttributionRow,
  LeadListItem,
  LeadNote,
  LeadForm,
  LeadSource,
  LeadStats,
  PublicPage,
  Office,
  Permission,
  PipelineColumn,
  PipelineStage,
  Product,
  Role,
  SourceReportRow,
  User,
  Notification,
} from './types';

// ── Auth ──────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<ApiSuccess<AuthResult>>('/auth/login', { email, password }).then((r) => r.data.data),
  me: () => api.get<ApiSuccess<AuthUser>>('/auth/me').then((r) => r.data.data),
  logout: (refreshToken: string) => api.post('/auth/logout', { refreshToken }),
};

// ── Users ─────────────────────────────────────────────
export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
  roleId?: string;
  officeId?: string;
}
export const usersApi = {
  list: (params: UserListParams) =>
    api.get<ApiSuccess<User[]>>('/users', { params }).then((r) => r.data),
  create: (body: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    phone?: string;
    roleId: string;
    officeId?: string;
  }) => api.post<ApiSuccess<User>>('/users', body).then((r) => r.data.data),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<ApiSuccess<User>>(`/users/${id}`, body).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/users/${id}`),
};

// ── Roles ─────────────────────────────────────────────
export const rolesApi = {
  list: () => api.get<ApiSuccess<Role[]>>('/roles').then((r) => r.data.data),
  permissions: () => api.get<ApiSuccess<Permission[]>>('/roles/permissions').then((r) => r.data.data),
  setPermissions: (id: string, permissions: string[]) =>
    api.patch<ApiSuccess<Role>>(`/roles/${id}/permissions`, { permissions }).then((r) => r.data.data),
};

// ── Leads (Phase 2) ───────────────────────────────────
export interface LeadListParams {
  page?: number;
  limit?: number;
  search?: string;
  stageId?: string;
  status?: string;
  priority?: string;
  assignedToId?: string;
  leadSourceId?: string;
  sort?: string;
  order?: string;
}
export const leadsApi = {
  list: (params: LeadListParams) =>
    api.get<ApiSuccess<LeadListItem[]>>('/leads', { params }).then((r) => r.data),
  stats: () => api.get<ApiSuccess<LeadStats>>('/leads/stats').then((r) => r.data.data),
  get: (id: string) => api.get<ApiSuccess<Lead>>(`/leads/${id}`).then((r) => r.data.data),
  create: (body: Record<string, unknown>) =>
    api.post<ApiSuccess<Lead>>('/leads', body).then((r) => r.data.data),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<ApiSuccess<Lead>>(`/leads/${id}`, body).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/leads/${id}`),
  assign: (id: string, assignedToId: string | null, autoAssign?: boolean) =>
    api.patch<ApiSuccess<Lead>>(`/leads/${id}/assign`, { assignedToId, autoAssign }).then((r) => r.data.data),
  moveStage: (id: string, stageId: string, reason?: string) =>
    api.patch<ApiSuccess<Lead>>(`/leads/${id}/stage`, { stageId, reason }).then((r) => r.data.data),
  markLost: (id: string, lostReason: string) =>
    api.patch<ApiSuccess<Lead>>(`/leads/${id}/lost`, { lostReason }).then((r) => r.data.data),
  activities: (id: string) =>
    api.get<ApiSuccess<LeadActivity[]>>(`/leads/${id}/activities`).then((r) => r.data.data),
  addActivity: (id: string, body: Record<string, unknown>) =>
    api.post<ApiSuccess<LeadActivity>>(`/leads/${id}/activities`, body).then((r) => r.data.data),
  notes: (id: string) => api.get<ApiSuccess<LeadNote[]>>(`/leads/${id}/notes`).then((r) => r.data.data),
  addNote: (id: string, body: string, isPinned?: boolean) =>
    api.post<ApiSuccess<LeadNote>>(`/leads/${id}/notes`, { body, isPinned }).then((r) => r.data.data),
  attributions: (id: string) =>
    api.get<ApiSuccess<LeadAttributionRow[]>>(`/leads/${id}/attributions`).then((r) => r.data.data),
};

export const pipelineApi = {
  stages: (track: 'LEAD' | 'DEAL' = 'LEAD') =>
    api.get<ApiSuccess<PipelineStage[]>>('/pipeline/stages', { params: { track } }).then((r) => r.data.data),
  board: () => api.get<ApiSuccess<PipelineColumn[]>>('/pipeline/board').then((r) => r.data.data),
};

export const sourcesApi = {
  list: () => api.get<ApiSuccess<LeadSource[]>>('/sources').then((r) => r.data.data),
  attribution: (days?: number) =>
    api
      .get<ApiSuccess<SourceReportRow[]>>('/sources/attribution', { params: { days } })
      .then((r) => r.data.data),
};

export const campaignsApi = {
  list: () => api.get<ApiSuccess<CampaignRow[]>>('/campaigns').then((r) => r.data.data),
};

// ── Marketing (Phase 5) ───────────────────────────────
export const marketingApi = {
  listPages: (params?: { search?: string; status?: string; limit?: number }) =>
    api.get<ApiSuccess<LandingPage[]>>('/landing-pages', { params }).then((r) => r.data),
  getPage: (id: string) => api.get<ApiSuccess<LandingPage>>(`/landing-pages/${id}`).then((r) => r.data.data),
  createPage: (body: Record<string, unknown>) =>
    api.post<ApiSuccess<LandingPage>>('/landing-pages', body).then((r) => r.data.data),
  updatePage: (id: string, body: Record<string, unknown>) =>
    api.patch<ApiSuccess<LandingPage>>(`/landing-pages/${id}`, body).then((r) => r.data.data),
  removePage: (id: string) => api.delete(`/landing-pages/${id}`),
  createForm: (pageId: string, body: Record<string, unknown>) =>
    api.post<ApiSuccess<LeadForm>>(`/landing-pages/${pageId}/forms`, body).then((r) => r.data.data),
  updateForm: (formId: string, body: Record<string, unknown>) =>
    api.patch<ApiSuccess<LeadForm>>(`/forms/${formId}`, body).then((r) => r.data.data),
  publicPage: (slug: string) => api.get<ApiSuccess<PublicPage>>(`/p/${slug}`).then((r) => r.data.data),
  publicSubmit: (body: Record<string, unknown>) =>
    api.post<ApiSuccess<{ message: string; reference?: string }>>('/leads/submit', body).then((r) => r.data.data),
  // Global site form (singleton) — used by kratos-energy.com home/contact pages.
  getGlobalForm: () => api.get<ApiSuccess<LeadForm | null>>('/forms/global').then((r) => r.data.data),
  saveGlobalForm: (body: Record<string, unknown>) =>
    api.put<ApiSuccess<LeadForm>>('/forms/global', body).then((r) => r.data.data),
};

// ── Catalog (Phase 6) ─────────────────────────────────
export const catalogApi = {
  listProducts: (params?: { search?: string; category?: string; limit?: number }) =>
    api.get<ApiSuccess<Product[]>>('/products', { params }).then((r) => r.data),
  categories: () => api.get<ApiSuccess<string[]>>('/products/categories').then((r) => r.data.data),
  createProduct: (body: Record<string, unknown>) =>
    api.post<ApiSuccess<Product>>('/products', body).then((r) => r.data.data),
  updateProduct: (id: string, body: Record<string, unknown>) =>
    api.patch<ApiSuccess<Product>>(`/products/${id}`, body).then((r) => r.data.data),
  removeProduct: (id: string) => api.delete(`/products/${id}`),
  listPackages: (params?: { search?: string; limit?: number }) =>
    api.get<ApiSuccess<CatalogPackage[]>>('/packages', { params }).then((r) => r.data),
  getPackage: (id: string) => api.get<ApiSuccess<CatalogPackage>>(`/packages/${id}`).then((r) => r.data.data),
  createPackage: (body: Record<string, unknown>) =>
    api.post<ApiSuccess<CatalogPackage>>('/packages', body).then((r) => r.data.data),
  updatePackage: (id: string, body: Record<string, unknown>) =>
    api.patch<ApiSuccess<CatalogPackage>>(`/packages/${id}`, body).then((r) => r.data.data),
  removePackage: (id: string) => api.delete(`/packages/${id}`),
  setPackageProducts: (id: string, products: { productId: string; quantity: number }[]) =>
    api.put<ApiSuccess<CatalogPackage>>(`/packages/${id}/products`, { products }).then((r) => r.data.data),
  // Upload a product/package image → cropped to 400×400 WebP; returns its public URL.
  uploadImage: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api
      .post<ApiSuccess<{ url: string; width: number; height: number }>>('/media/catalog', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },
};

// ── Chatbot integration ───────────────────────────────
export const chatApi = {
  status: () => api.get<ApiSuccess<{ configured: boolean; apiBase: string }>>('/chatbot/status').then((r) => r.data.data),
  conversations: (params?: { waiting?: boolean; leadId?: string; search?: string }) =>
    api.get<ApiSuccess<ChatConversation[]>>('/chatbot/conversations', { params }).then((r) => r.data.data),
  conversation: (id: string) =>
    api.get<ApiSuccess<ChatConversation>>(`/chatbot/conversations/${id}`).then((r) => r.data.data),
  refresh: (id: string) =>
    api.post<ApiSuccess<ChatConversation>>(`/chatbot/conversations/${id}/refresh`).then((r) => r.data.data),
  sync: () =>
    api.post<ApiSuccess<{ conversations: number; leads: number; newLeads: number }>>('/chatbot/sync').then((r) => r.data.data),
  takeover: (id: string) =>
    api.post<ApiSuccess<ChatConversation>>(`/chatbot/conversations/${id}/takeover`).then((r) => r.data.data),
  reply: (id: string, text: string) =>
    api.post<ApiSuccess<ChatConversation>>(`/chatbot/conversations/${id}/reply`, { text }).then((r) => r.data.data),
  release: (id: string) =>
    api.post<ApiSuccess<ChatConversation>>(`/chatbot/conversations/${id}/release`).then((r) => r.data.data),
  markContacted: (leadId: string) => api.post(`/chatbot/leads/${leadId}/contacted`),
};

// ── Deals (Phase 4) ───────────────────────────────────
export const dealsApi = {
  list: (params: { page?: number; limit?: number; search?: string; stageId?: string; status?: string }) =>
    api.get<ApiSuccess<Deal[]>>('/deals', { params }).then((r) => r.data),
  stats: () => api.get<ApiSuccess<DealStats>>('/deals/stats').then((r) => r.data.data),
  get: (id: string) => api.get<ApiSuccess<Deal>>(`/deals/${id}`).then((r) => r.data.data),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<ApiSuccess<Deal>>(`/deals/${id}`, body).then((r) => r.data.data),
  convert: (leadId: string, body: Record<string, unknown>) =>
    api.post<ApiSuccess<Deal>>(`/leads/${leadId}/convert`, body).then((r) => r.data.data),
  addItem: (id: string, body: { description: string; quantity: number; unitPrice: number }) =>
    api.post<ApiSuccess<DealItem>>(`/deals/${id}/items`, body).then((r) => r.data.data),
  removeItem: (id: string, itemId: string) => api.delete(`/deals/${id}/items/${itemId}`),
  moveStage: (id: string, stageId: string, reason?: string) =>
    api.patch<ApiSuccess<Deal>>(`/deals/${id}/stage`, { stageId, reason }).then((r) => r.data.data),
  win: (id: string) => api.post<ApiSuccess<Deal>>(`/deals/${id}/win`).then((r) => r.data.data),
  lose: (id: string, lostReason: string) =>
    api.post<ApiSuccess<Deal>>(`/deals/${id}/lose`, { lostReason }).then((r) => r.data.data),
};

// ── Offices ───────────────────────────────────────────
export const officesApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get<ApiSuccess<Office[]>>('/offices', { params }).then((r) => r.data),
  create: (body: { name: string; code: string; timezone?: string; phone?: string }) =>
    api.post<ApiSuccess<Office>>('/offices', body).then((r) => r.data.data),
  update: (id: string, body: Record<string, unknown>) =>
    api.patch<ApiSuccess<Office>>(`/offices/${id}`, body).then((r) => r.data.data),
  remove: (id: string) => api.delete(`/offices/${id}`),
};

// ── Notifications (Phase 7) ───────────────────────────
export const notificationsApi = {
  list: (params?: { unread?: boolean; page?: number; limit?: number }) =>
    api
      .get<ApiSuccess<Notification[]> & { meta: { unread: number; total: number } }>('/notifications', { params })
      .then((r) => r.data),
  unreadCount: () => api.get<ApiSuccess<{ unread: number }>>('/notifications/unread-count').then((r) => r.data.data.unread),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  getSettings: () => api.get<ApiSuccess<{ adminEmails: string[] }>>('/notifications/settings').then((r) => r.data.data),
  saveSettings: (adminEmails: string[]) =>
    api.put<ApiSuccess<{ adminEmails: string[] }>>('/notifications/settings', { adminEmails }).then((r) => r.data.data),
};
