import { z } from 'zod';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { env } from '../config/env';

// Auth
import { loginSchema, refreshSchema } from '../../modules/auth/auth.schema';
// Users
import { createUserSchema, updateUserSchema } from '../../modules/users/users.schema';
// Roles
import { updateRolePermissionsSchema } from '../../modules/roles/roles.schema';
// Offices
import { createOfficeSchema, updateOfficeSchema } from '../../modules/offices/offices.schema';
// Leads
import {
  createLeadSchema,
  updateLeadSchema,
  assignSchema,
  moveStageSchema,
  lostSchema,
  addNoteSchema,
  addActivitySchema,
} from '../../modules/leads/leads.schema';
// Intake + campaigns (Phase 3)
import {
  publicSubmitSchema,
  chatbotIntakeSchema,
  socialIntakeSchema,
  socialPlatformParamSchema,
} from '../../modules/intake/intake.schema';
import { createCampaignSchema, updateCampaignSchema } from '../../modules/sources/sources.routes';
// Deals (Phase 4)
import {
  convertLeadSchema,
  updateDealSchema,
  dealItemInput,
  moveDealStageSchema,
  loseDealSchema,
} from '../../modules/deals/deals.schema';
// Marketing (Phase 5)
import {
  createPageSchema,
  updatePageSchema,
  createFormSchema,
  updateFormSchema,
} from '../../modules/marketing/marketing.schema';
// Catalog (Phase 6)
import {
  createProductSchema,
  updateProductSchema,
  createPackageSchema,
  updatePackageSchema,
  setPackageProductsSchema,
} from '../../modules/catalog/catalog.schema';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

const idParam = z.object({ id: z.string().uuid() });

// ── Reusable response wrappers ────────────────────────
const json = (schema: z.ZodTypeAny) => ({ content: { 'application/json': { schema } } });
const OK = 'Success';
const successEnvelope = z
  .object({ success: z.literal(true), data: z.any() })
  .openapi('SuccessResponse');
const errorEnvelope = z
  .object({
    success: z.literal(false),
    error: z.object({ code: z.string(), message: z.string(), details: z.any().optional() }),
  })
  .openapi('ErrorResponse');

const secured = [{ bearerAuth: [] }];
const commonErrors = {
  400: { description: 'Bad request', ...json(errorEnvelope) },
  401: { description: 'Unauthorized', ...json(errorEnvelope) },
  403: { description: 'Forbidden', ...json(errorEnvelope) },
  404: { description: 'Not found', ...json(errorEnvelope) },
  422: { description: 'Validation error', ...json(errorEnvelope) },
};

function okResponse(desc = OK) {
  return { description: desc, ...json(successEnvelope) };
}

// ── Helper to cut path boilerplate ────────────────────
interface PathOpts {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  tag: string;
  summary: string;
  auth?: boolean;
  params?: z.AnyZodObject;
  query?: z.AnyZodObject;
  body?: z.ZodTypeAny;
  created?: boolean;
}
function path(o: PathOpts) {
  registry.registerPath({
    method: o.method,
    path: o.path,
    tags: [o.tag],
    summary: o.summary,
    ...(o.auth === false ? {} : { security: secured }),
    request: {
      ...(o.params ? { params: o.params } : {}),
      ...(o.query ? { query: o.query } : {}),
      ...(o.body ? { body: json(o.body) } : {}),
    },
    responses: {
      [o.created ? 201 : 200]: okResponse(),
      ...commonErrors,
    },
  });
}

// ═══════════════ Auth ═══════════════
path({ method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Log in', auth: false, body: loginSchema });
path({ method: 'post', path: '/auth/refresh', tag: 'Auth', summary: 'Rotate refresh token', auth: false, body: refreshSchema });
path({ method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Log out', auth: false, body: refreshSchema });
path({ method: 'get', path: '/auth/me', tag: 'Auth', summary: 'Current user + permissions' });

// ═══════════════ Users ═══════════════
path({ method: 'get', path: '/users', tag: 'Users', summary: 'List staff' });
path({ method: 'post', path: '/users', tag: 'Users', summary: 'Create user', body: createUserSchema, created: true });
path({ method: 'get', path: '/users/{id}', tag: 'Users', summary: 'Get user', params: idParam });
path({ method: 'patch', path: '/users/{id}', tag: 'Users', summary: 'Update user', params: idParam, body: updateUserSchema });
path({ method: 'delete', path: '/users/{id}', tag: 'Users', summary: 'Deactivate user', params: idParam });

// ═══════════════ Roles ═══════════════
path({ method: 'get', path: '/roles', tag: 'Roles', summary: 'List roles' });
path({ method: 'get', path: '/roles/permissions', tag: 'Roles', summary: 'List permissions' });
path({ method: 'get', path: '/roles/{id}', tag: 'Roles', summary: 'Get role', params: idParam });
path({ method: 'patch', path: '/roles/{id}/permissions', tag: 'Roles', summary: 'Set role permissions', params: idParam, body: updateRolePermissionsSchema });

// ═══════════════ Offices ═══════════════
path({ method: 'get', path: '/offices', tag: 'Offices', summary: 'List offices' });
path({ method: 'post', path: '/offices', tag: 'Offices', summary: 'Create office', body: createOfficeSchema, created: true });
path({ method: 'get', path: '/offices/{id}', tag: 'Offices', summary: 'Get office', params: idParam });
path({ method: 'patch', path: '/offices/{id}', tag: 'Offices', summary: 'Update office', params: idParam, body: updateOfficeSchema });
path({ method: 'delete', path: '/offices/{id}', tag: 'Offices', summary: 'Delete office', params: idParam });

// ═══════════════ Leads ═══════════════
path({ method: 'get', path: '/leads', tag: 'Leads', summary: 'List leads (filtered, scoped by role)' });
path({ method: 'get', path: '/leads/stats', tag: 'Leads', summary: 'Lead stats' });
path({ method: 'post', path: '/leads', tag: 'Leads', summary: 'Create lead (dedupe + auto-assign)', body: createLeadSchema, created: true });
path({ method: 'get', path: '/leads/{id}', tag: 'Leads', summary: 'Get lead', params: idParam });
path({ method: 'patch', path: '/leads/{id}', tag: 'Leads', summary: 'Update lead', params: idParam, body: updateLeadSchema });
path({ method: 'delete', path: '/leads/{id}', tag: 'Leads', summary: 'Delete lead', params: idParam });
path({ method: 'patch', path: '/leads/{id}/assign', tag: 'Leads', summary: 'Assign / reassign', params: idParam, body: assignSchema });
path({ method: 'patch', path: '/leads/{id}/stage', tag: 'Leads', summary: 'Move stage', params: idParam, body: moveStageSchema });
path({ method: 'patch', path: '/leads/{id}/lost', tag: 'Leads', summary: 'Mark lost', params: idParam, body: lostSchema });
path({ method: 'get', path: '/leads/{id}/notes', tag: 'Leads', summary: 'List notes', params: idParam });
path({ method: 'post', path: '/leads/{id}/notes', tag: 'Leads', summary: 'Add note', params: idParam, body: addNoteSchema, created: true });
path({ method: 'get', path: '/leads/{id}/activities', tag: 'Leads', summary: 'Activity timeline', params: idParam });
path({ method: 'post', path: '/leads/{id}/activities', tag: 'Leads', summary: 'Log activity', params: idParam, body: addActivitySchema, created: true });

// ═══════════════ Pipeline & Sources ═══════════════
path({ method: 'get', path: '/pipeline/stages', tag: 'Pipeline', summary: 'List stages' });
path({ method: 'get', path: '/pipeline/board', tag: 'Pipeline', summary: 'Kanban board' });
path({ method: 'get', path: '/sources', tag: 'Sources', summary: 'List lead sources' });
path({ method: 'get', path: '/sources/attribution', tag: 'Sources', summary: 'Leads by source w/ conversion (?days=30)' });
path({ method: 'get', path: '/leads/{id}/attributions', tag: 'Leads', summary: 'Attribution touches for a lead', params: idParam });

// ═══════════════ Intake (Phase 3) ═══════════════
path({ method: 'post', path: '/leads/submit', tag: 'Intake', summary: 'Public website/landing-page submission (no auth, rate-limited, honeypot)', auth: false, body: publicSubmitSchema, created: true });
path({ method: 'post', path: '/intake/chatbot', tag: 'Intake', summary: 'Chatbot webhook (x-webhook-secret header)', auth: false, body: chatbotIntakeSchema, created: true });
path({ method: 'post', path: '/intake/social/{platform}', tag: 'Intake', summary: 'Social lead-ads webhook (x-webhook-secret header)', auth: false, params: socialPlatformParamSchema, body: socialIntakeSchema, created: true });

// ═══════════════ Deals (Phase 4) ═══════════════
path({ method: 'post', path: '/leads/{id}/convert', tag: 'Deals', summary: 'Convert lead → deal (marks lead CONVERTED)', params: idParam, body: convertLeadSchema, created: true });
path({ method: 'get', path: '/deals', tag: 'Deals', summary: 'List deals (scoped by role)' });
path({ method: 'get', path: '/deals/stats', tag: 'Deals', summary: 'Open pipeline value, won MTD, win rate' });
path({ method: 'get', path: '/deals/{id}', tag: 'Deals', summary: 'Get deal (items + stage history)', params: idParam });
path({ method: 'patch', path: '/deals/{id}', tag: 'Deals', summary: 'Update deal', params: idParam, body: updateDealSchema });
path({ method: 'post', path: '/deals/{id}/items', tag: 'Deals', summary: 'Add line item (snapshot price)', params: idParam, body: dealItemInput, created: true });
path({ method: 'patch', path: '/deals/{id}/stage', tag: 'Deals', summary: 'Move deal stage', params: idParam, body: moveDealStageSchema });
path({ method: 'post', path: '/deals/{id}/win', tag: 'Deals', summary: 'Close won', params: idParam });
path({ method: 'post', path: '/deals/{id}/lose', tag: 'Deals', summary: 'Close lost (+reason)', params: idParam, body: loseDealSchema });

// ═══════════════ Marketing (Phase 5) ═══════════════
path({ method: 'get', path: '/landing-pages', tag: 'Marketing', summary: 'List landing pages' });
path({ method: 'post', path: '/landing-pages', tag: 'Marketing', summary: 'Create landing page', body: createPageSchema, created: true });
path({ method: 'get', path: '/landing-pages/{id}', tag: 'Marketing', summary: 'Get page (+forms, metrics)', params: idParam });
path({ method: 'patch', path: '/landing-pages/{id}', tag: 'Marketing', summary: 'Update page (incl. status publish/archive)', params: idParam, body: updatePageSchema });
path({ method: 'delete', path: '/landing-pages/{id}', tag: 'Marketing', summary: 'Archive page', params: idParam });
path({ method: 'post', path: '/landing-pages/{id}/forms', tag: 'Marketing', summary: 'Create dynamic form (fields_schema)', params: idParam, body: createFormSchema, created: true });
path({ method: 'patch', path: '/forms/{id}', tag: 'Marketing', summary: 'Update form (schema change bumps version)', params: idParam, body: updateFormSchema });
path({ method: 'get', path: '/p/{slug}', tag: 'Marketing', summary: 'PUBLIC: fetch published page + active form (increments views)', auth: false, params: z.object({ slug: z.string() }) });

// ═══════════════ Catalog (Phase 6) ═══════════════
path({ method: 'get', path: '/products', tag: 'Catalog', summary: 'List products (staff, incl. inactive)' });
path({ method: 'get', path: '/products/categories', tag: 'Catalog', summary: 'Distinct product categories' });
path({ method: 'get', path: '/products/{id}', tag: 'Catalog', summary: 'Get product (+finalPrice)', params: idParam });
path({ method: 'post', path: '/products', tag: 'Catalog', summary: 'Create product (admin)', body: createProductSchema, created: true });
path({ method: 'patch', path: '/products/{id}', tag: 'Catalog', summary: 'Update product (admin)', params: idParam, body: updateProductSchema });
path({ method: 'delete', path: '/products/{id}', tag: 'Catalog', summary: 'Delete product (blocked while in a package)', params: idParam });
path({ method: 'get', path: '/packages', tag: 'Catalog', summary: 'List packages (staff, incl. unpublished)' });
path({ method: 'get', path: '/packages/{id}', tag: 'Catalog', summary: 'Get package (+components, componentsTotal, displayPrice)', params: idParam });
path({ method: 'post', path: '/packages', tag: 'Catalog', summary: 'Create package (admin)', body: createPackageSchema, created: true });
path({ method: 'patch', path: '/packages/{id}', tag: 'Catalog', summary: 'Update package / publish toggle (admin)', params: idParam, body: updatePackageSchema });
path({ method: 'delete', path: '/packages/{id}', tag: 'Catalog', summary: 'Delete package (admin)', params: idParam });
registry.registerPath({
  method: 'put',
  path: '/packages/{id}/products',
  tags: ['Catalog'],
  summary: 'Compose package from products (replaces component list)',
  security: secured,
  request: { params: idParam, body: json(setPackageProductsSchema) },
  responses: { 200: okResponse(), ...commonErrors },
});

// ═══════════════ Public Website API (Phase 6) ═══════════════
path({ method: 'get', path: '/public/products', tag: 'Public Website', summary: 'PUBLIC: active products for the main website', auth: false });
path({ method: 'get', path: '/public/packages', tag: 'Public Website', summary: 'PUBLIC: published packages with components + pricing', auth: false });
path({ method: 'get', path: '/public/packages/{slug}', tag: 'Public Website', summary: 'PUBLIC: one published package by slug', auth: false, params: z.object({ slug: z.string() }) });

// ═══════════════ Chatbot integration ═══════════════
path({ method: 'post', path: '/chatbot/webhook', tag: 'Chatbot', summary: 'Platform webhook receiver (X-Webhook-Signature HMAC; events: lead.created, message.created, conversation.human_requested, ping)', auth: false, body: z.object({ event: z.string(), created_at: z.string(), data: z.record(z.unknown()) }) });
path({ method: 'get', path: '/chatbot/status', tag: 'Chatbot', summary: 'Integration status (configured?)' });
path({ method: 'get', path: '/chatbot/conversations', tag: 'Chatbot', summary: 'List mirrored conversations (waiting-for-human first)' });
path({ method: 'get', path: '/chatbot/conversations/{id}', tag: 'Chatbot', summary: 'Conversation + transcript (replay)', params: idParam });
path({ method: 'post', path: '/chatbot/conversations/{id}/refresh', tag: 'Chatbot', summary: 'Pull latest transcript from the platform', params: idParam });
path({ method: 'post', path: '/chatbot/sync', tag: 'Chatbot', summary: 'Pull new conversations + leads (backfill/safety net)' });
path({ method: 'post', path: '/chatbot/conversations/{id}/takeover', tag: 'Chatbot', summary: 'Live agent takeover (pauses AI)', params: idParam });
path({ method: 'post', path: '/chatbot/conversations/{id}/reply', tag: 'Chatbot', summary: 'Send agent reply to the visitor', params: idParam, body: z.object({ text: z.string().min(1).max(4000) }) });
path({ method: 'post', path: '/chatbot/conversations/{id}/release', tag: 'Chatbot', summary: 'Hand chat back to the AI', params: idParam });
path({ method: 'post', path: '/chatbot/leads/{id}/contacted', tag: 'Chatbot', summary: 'Write-back: mark lead contacted on the platform', params: idParam });

// ═══════════════ Campaigns (Phase 3) ═══════════════
path({ method: 'get', path: '/campaigns', tag: 'Campaigns', summary: 'Campaign performance (leads + cost-per-lead)' });
path({ method: 'post', path: '/campaigns', tag: 'Campaigns', summary: 'Create campaign', body: createCampaignSchema, created: true });
path({ method: 'patch', path: '/campaigns/{id}', tag: 'Campaigns', summary: 'Update campaign', params: idParam, body: updateCampaignSchema });

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Kratos Energy CRM API',
      version: '1.0.0',
      description:
        'Lead-management CRM API. Phases 1–2: auth/RBAC/offices, leads, pipeline, round-robin assignment. Authenticate via /auth/login, then click "Authorize" and paste the accessToken.',
    },
    servers: [{ url: env.API_PREFIX }],
    security: secured,
  });
}
