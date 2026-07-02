export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: { slug: string; name: string };
  office: { id: string; name: string } | null;
  permissions: string[];
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface Office {
  id: string;
  name: string;
  code: string;
  timezone: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  userCount?: number;
  permissions: string[];
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  slug: string;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  office: { id: string; name: string } | null;
  role: { id: string; name: string; slug: string };
}

// ── Phase 2: Leads ────────────────────────────────────
export type LeadStatus = 'OPEN' | 'CONVERTED' | 'LOST' | 'JUNK';
export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface LeadSource {
  id: string;
  name: string;
  slug: string;
  type: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  slug: string;
  track: 'LEAD' | 'DEAL';
  order: number;
  color: string | null;
  isDefault: boolean;
  isWon: boolean;
  isLost: boolean;
}

export interface LeadListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  suburb: string | null;
  state: string | null;
  status: LeadStatus;
  priority: LeadPriority;
  score: number;
  estimatedSystemSize: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  stage: { id: string; name: string; slug: string; color: string | null } | null;
  source: { id: string; name: string; type: string } | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
}

export interface Lead extends LeadListItem {
  secondaryPhone: string | null;
  addressLine: string | null;
  postcode: string | null;
  propertyType: string | null;
  roofType: string | null;
  leadType: string | null;
  lostReason: string | null;
  consentMarketing: boolean;
  office: { id: string; name: string } | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
}

export interface LeadActivity {
  id: string;
  type: 'NOTE' | 'CALL' | 'EMAIL' | 'SMS' | 'MEETING' | 'STAGE_CHANGE' | 'ASSIGNMENT' | 'SYSTEM';
  subject: string | null;
  body: string | null;
  occurredAt: string;
  user: { id: string; firstName: string; lastName: string } | null;
}

export interface LeadNote {
  id: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  author: { id: string; firstName: string; lastName: string } | null;
}

export interface LeadStats {
  total: number;
  open: number;
  converted: number;
  lost: number;
  byStage: { stageId: string | null; _count: { _all: number } }[];
  bySource: { leadSourceId: string | null; _count: { _all: number } }[];
}

export interface PipelineColumn extends PipelineStage {
  leads: LeadListItem[];
}

// ── Phase 3: Attribution ──────────────────────────────
export interface SourceReportRow {
  sourceId: string | null;
  sourceName: string;
  sourceType: string;
  total: number;
  open: number;
  converted: number;
  lost: number;
  conversionRate: number;
}

export interface LeadAttributionRow {
  id: string;
  touchType: 'FIRST' | 'LAST';
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrerUrl: string | null;
  createdAt: string;
  source: { name: string; type: string } | null;
  campaign: { name: string } | null;
}

// ── Phase 4: Deals ────────────────────────────────────
export type DealStatus = 'OPEN' | 'WON' | 'LOST';

export interface DealItem {
  id: string;
  itemType: 'PACKAGE' | 'PRODUCT' | 'CUSTOM';
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface Deal {
  id: string;
  dealNumber: number;
  title: string;
  status: DealStatus;
  value: string;
  expectedCloseDate: string | null;
  closedAt: string | null;
  lostReason: string | null;
  createdAt: string;
  stage: PipelineStage | null;
  owner: { id: string; firstName: string; lastName: string } | null;
  lead: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    suburb: string | null;
    state: string | null;
    source: { name: string; type: string } | null;
  };
  items: DealItem[];
  stageHistory?: {
    id: string;
    reason: string | null;
    changedAt: string;
    changedBy: { firstName: string; lastName: string } | null;
  }[];
}

export interface DealStats {
  open: number;
  openValue: number;
  wonMtd: number;
  wonValueMtd: number;
  winRateMtd: number;
}

// ── Phase 5: Landing pages & forms ────────────────────
export type PageStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface FormField {
  field_name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'number' | 'select' | 'multiselect' | 'radio' | 'checkbox' | 'textarea' | 'date';
  required?: boolean;
  options?: string[];
  placeholder?: string;
  help_text?: string;
  order?: number;
  validation?: { min?: number; max?: number; pattern?: string };
}

export interface LeadForm {
  id: string;
  formTitle: string;
  fieldsSchema: FormField[];
  version: number;
  isActive: boolean;
  submitButtonText: string;
}

export interface LandingPage {
  id: string;
  title: string;
  urlSlug: string;
  heroDescription: string | null;
  heroImageUrl: string | null;
  detailedDescription: string | null;
  thankYouMessage: string | null;
  redirectUrl: string | null;
  seoMeta: { title?: string; description?: string } | null;
  status: PageStatus;
  publishedAt: string | null;
  viewCount: number;
  conversionCount: number;
  createdAt: string;
  campaign: { id: string; name: string } | null;
  forms: LeadForm[];
  _count?: { leads: number };
}

export interface PublicPage {
  id: string;
  title: string;
  urlSlug: string;
  heroDescription: string | null;
  heroImageUrl: string | null;
  detailedDescription: string | null;
  thankYouMessage: string | null;
  redirectUrl: string | null;
  forms: LeadForm[];
}

export interface CampaignRow {
  id: string;
  name: string;
  channel: string | null;
  utmCampaign: string | null;
  budget: number | null;
  spend: number | null;
  leads: number;
  costPerLead: number | null;
  isActive: boolean;
}
