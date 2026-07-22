import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../shared/errors/AppError';
import { pickRoundRobinAssignee } from '../leads/assignment.service';
import { notificationService } from '../notifications/notification.service';
import { parseFieldsSchema, validateSubmission, splitMappedFields, type FieldDescriptor } from '../marketing/formEngine';
import type {
  AttributionInput,
  ChatbotIntakeInput,
  PublicSubmitInput,
  SocialIntakeInput,
} from './intake.schema';

interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

interface CaptureResult {
  leadId: string;
  duplicate: boolean;
  assignedToName: string | null;
}

async function resolveSourceId(slug: string): Promise<string | null> {
  const source = await prisma.leadSource.findUnique({ where: { slug } });
  return source?.id ?? null;
}

// Match a campaign by utm_campaign (exact) — creates nothing.
async function resolveCampaignId(utmCampaign?: string): Promise<string | null> {
  if (!utmCampaign) return null;
  const campaign = await prisma.marketingCampaign.findFirst({
    where: { OR: [{ utmCampaign }, { slug: utmCampaign }], isActive: true },
  });
  return campaign?.id ?? null;
}

function attributionData(attr: AttributionInput, meta: ClientMeta) {
  return {
    utmSource: attr.utmSource,
    utmMedium: attr.utmMedium,
    utmCampaign: attr.utmCampaign,
    utmTerm: attr.utmTerm,
    utmContent: attr.utmContent,
    gclid: attr.gclid,
    fbclid: attr.fbclid,
    referrerUrl: attr.referrerUrl,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  };
}

interface CaptureLeadArgs {
  channel: string; // 'web' | 'social:facebook' | 'chatbot' ...
  sourceSlug: string;
  landingPageId?: string | null;
  contact: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    addressLine?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
    propertyType?: string;
    roofType?: string;
    estimatedSystemSize?: string;
    consentMarketing?: boolean;
  };
  attribution: AttributionInput;
  customFields?: Record<string, unknown>;
  message?: string;
  rawPayload: unknown;
  meta: ClientMeta;
}

// Core capture pipeline shared by all channels:
// dedupe → (dup: append LAST-touch attribution) | (new: create + assign + FIRST touch)
// Every submission archived in form_submissions either way.
export async function captureLead(args: CaptureLeadArgs): Promise<CaptureResult> {
  const email = args.contact.email ? args.contact.email.toLowerCase() : null;
  const phone = args.contact.phone ?? null;
  const sourceId = await resolveSourceId(args.sourceSlug);
  const campaignId = await resolveCampaignId(args.attribution.utmCampaign);

  const or: Prisma.LeadWhereInput[] = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  const existing = or.length
    ? await prisma.lead.findFirst({ where: { deletedAt: null, OR: or } })
    : null;

  if (existing) {
    // Enrich the existing lead with any contact fields it's missing —
    // a repeat enquiry often carries new info (e.g. email this time).
    const fill: Prisma.LeadUpdateInput = {};
    if (!existing.email && email) fill.email = email;
    if (!existing.phone && phone) fill.phone = phone;
    if (!existing.suburb && args.contact.suburb) fill.suburb = args.contact.suburb;
    if (!existing.state && args.contact.state) fill.state = args.contact.state;
    if (!existing.postcode && args.contact.postcode) fill.postcode = args.contact.postcode;
    if (Object.keys(fill).length) {
      await prisma.lead.update({ where: { id: existing.id }, data: fill });
    }

    // Re-submission: append last-touch attribution, log activity, archive payload.
    await prisma.$transaction([
      prisma.leadAttribution.create({
        data: {
          leadId: existing.id,
          leadSourceId: sourceId,
          campaignId,
          touchType: 'LAST',
          ...attributionData(args.attribution, args.meta),
          raw: args.rawPayload as Prisma.InputJsonValue,
        },
      }),
      prisma.leadActivity.create({
        data: {
          leadId: existing.id,
          type: 'SYSTEM',
          subject: 'Repeat enquiry',
          body: `New submission via ${args.channel}.`,
        },
      }),
      prisma.formSubmission.create({
        data: {
          leadId: existing.id,
          channel: args.channel,
          status: 'DUPLICATE',
          rawPayload: args.rawPayload as Prisma.InputJsonValue,
          ipAddress: args.meta.ip,
          userAgent: args.meta.userAgent,
        },
      }),
    ]);
    return { leadId: existing.id, duplicate: true, assignedToName: null };
  }

  // New lead.
  const defaultStage =
    (await prisma.pipelineStage.findFirst({ where: { track: 'LEAD', isDefault: true } })) ??
    (await prisma.pipelineStage.findFirst({ where: { track: 'LEAD' }, orderBy: { order: 'asc' } }));
  const assignedToId = await pickRoundRobinAssignee(null);

  const lead = await prisma.lead.create({
    data: {
      firstName: args.contact.firstName,
      lastName: args.contact.lastName || '—',
      email,
      phone,
      addressLine: args.contact.addressLine,
      suburb: args.contact.suburb,
      state: args.contact.state,
      postcode: args.contact.postcode,
      propertyType: args.contact.propertyType,
      roofType: args.contact.roofType,
      estimatedSystemSize: args.contact.estimatedSystemSize,
      consentMarketing: args.contact.consentMarketing ?? false,
      leadSourceId: sourceId,
      campaignId,
      landingPageId: args.landingPageId ?? undefined,
      stageId: defaultStage?.id,
      assignedToId,
      utmSource: args.attribution.utmSource,
      utmMedium: args.attribution.utmMedium,
      utmCampaign: args.attribution.utmCampaign,
      utmTerm: args.attribution.utmTerm,
      utmContent: args.attribution.utmContent,
      referrerUrl: args.attribution.referrerUrl,
      ipAddress: args.meta.ip,
      userAgent: args.meta.userAgent,
      customFormResponses: (args.customFields ?? {}) as Prisma.InputJsonValue,
    },
    include: { assignedTo: { select: { firstName: true, lastName: true } } },
  });

  const tx: Prisma.PrismaPromise<unknown>[] = [
    prisma.leadAttribution.create({
      data: {
        leadId: lead.id,
        leadSourceId: sourceId,
        campaignId,
        touchType: 'FIRST',
        ...attributionData(args.attribution, args.meta),
        raw: args.rawPayload as Prisma.InputJsonValue,
      },
    }),
    prisma.formSubmission.create({
      data: {
        leadId: lead.id,
        channel: args.channel,
        status: 'ACCEPTED',
        rawPayload: args.rawPayload as Prisma.InputJsonValue,
        ipAddress: args.meta.ip,
        userAgent: args.meta.userAgent,
      },
    }),
    prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'SYSTEM',
        subject: 'Lead captured',
        body: `Captured via ${args.channel}.`,
      },
    }),
  ];
  if (args.message) {
    tx.push(prisma.leadNote.create({ data: { leadId: lead.id, body: args.message } }));
  }
  if (assignedToId) {
    tx.push(
      prisma.leadAssignment.create({
        data: { leadId: lead.id, assignedToId, method: 'AUTO_ROUND_ROBIN' },
      }),
      prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'ASSIGNMENT',
          subject: 'Lead assigned',
          body: 'Auto-assigned (round-robin).',
        },
      }),
    );
  }
  await prisma.$transaction(tx);

  // Notifications — fire-and-forget, never block or fail the capture.
  void notificationService
    .onLeadCreated({
      id: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      suburb: lead.suburb,
      officeId: lead.officeId,
      channel: args.channel,
    })
    .catch(() => undefined);
  if (assignedToId) {
    void notificationService
      .onLeadAssigned({ id: lead.id, firstName: lead.firstName, lastName: lead.lastName, suburb: lead.suburb }, assignedToId)
      .catch(() => undefined);
  }

  return {
    leadId: lead.id,
    duplicate: false,
    assignedToName: lead.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : null,
  };
}

export const intakeService = {
  async publicSubmit(input: PublicSubmitInput, meta: ClientMeta): Promise<CaptureResult | null> {
    // Honeypot tripped — pretend success, store nothing.
    if (input.website) {
      logger.warn({ ip: meta.ip }, 'Honeypot tripped on public submit');
      return null;
    }

    // Resolve the applicable form (landing-page or global) and validate dynamic
    // fields against its stored fields_schema (PDF's validation engine).
    let landingPageId: string | null = null;
    let customFields = input.customFields ?? {};
    let formVersion: number | null = null;
    let fields: FieldDescriptor[] = [];

    if (input.landingPageSlug) {
      const page = await prisma.landingPage.findFirst({
        where: { urlSlug: input.landingPageSlug, status: 'PUBLISHED', deletedAt: null },
        include: { forms: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, take: 1 } },
      });
      if (!page) throw AppError.badRequest('Unknown or unpublished landing page');
      landingPageId = page.id;
      const form = page.forms[0];
      if (form) {
        fields = parseFieldsSchema(form.fieldsSchema);
        formVersion = form.version;
      }
    } else {
      // No landing page ⇒ global site form (contact/home).
      const globalForm = await prisma.customLeadForm.findFirst({
        where: { isGlobal: true, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (globalForm) {
        fields = parseFieldsSchema(globalForm.fieldsSchema);
        formVersion = globalForm.version;
      }
    }

    if (fields.length) {
      // Backfill mapped fields from the matching top-level key when the form
      // value is absent — so a caller may send e.g. email at the top level OR
      // inside customFields; either satisfies the mapped form field.
      const submitted: Record<string, unknown> = { ...(input.customFields ?? {}) };
      for (const f of fields) {
        if (f.maps_to) {
          const cur = submitted[f.field_name];
          if (cur === undefined || cur === null || cur === '') {
            const topLevel = (input as Record<string, unknown>)[f.maps_to];
            if (topLevel !== undefined && topLevel !== null && topLevel !== '') {
              submitted[f.field_name] = topLevel;
            }
          }
        }
      }
      const result = validateSubmission(fields, submitted);
      if (!result.valid) {
        throw AppError.badRequest('Form validation failed', { fields: result.errors });
      }
      customFields = result.cleaned;
    }

    // Route mapped fields (maps_to) into core lead columns; top-level input
    // fields fill anything not supplied by the form.
    const { contact: mapped, custom } = splitMappedFields(fields, customFields);
    customFields = custom;

    // Structured extras that aren't part of the form schema get dropped by the
    // validator — pass through origin markers + the build-configurator payload
    // (build_*) so the CRM can render them. Primitives only, strings capped.
    const PASSTHROUGH_KEYS = new Set(['lead_source', 'source_page']);
    for (const [key, value] of Object.entries(input.customFields ?? {})) {
      if (!PASSTHROUGH_KEYS.has(key) && !key.startsWith('build_')) continue;
      if (value === undefined || value === null || value === '') continue;
      if (typeof value === 'string') customFields[key] = value.slice(0, 500);
      else if (typeof value === 'number' || typeof value === 'boolean') customFields[key] = value;
    }

    const firstName = (mapped.firstName ?? input.firstName)?.trim();
    const email = mapped.email ?? (input.email || undefined);
    const phone = mapped.phone ?? input.phone;

    // Minimum lead identity — enforced after mapping so a CRM-built form can
    // satisfy it via mapped fields.
    if (!firstName) {
      throw AppError.badRequest('Form validation failed', {
        fields: [{ field: 'firstName', message: 'A name is required' }],
      });
    }
    if (!email && !phone) {
      throw AppError.badRequest('Form validation failed', {
        fields: [{ field: 'email', message: 'An email or phone number is required' }],
      });
    }

    const contact = {
      firstName,
      lastName: mapped.lastName ?? input.lastName,
      email,
      phone,
      addressLine: input.addressLine,
      suburb: mapped.suburb ?? input.suburb,
      state: mapped.state ?? input.state,
      postcode: mapped.postcode ?? input.postcode,
      propertyType: input.propertyType,
      roofType: input.roofType,
      estimatedSystemSize: input.estimatedSystemSize,
      consentMarketing: input.consentMarketing,
    };

    const capture = await captureLead({
      channel: input.landingPageSlug ? `web:${input.landingPageSlug}` : 'web',
      sourceSlug: input.sourceSlug ?? (input.landingPageSlug ? 'landing-page' : 'website'),
      landingPageId,
      contact,
      attribution: input,
      customFields,
      message: input.message,
      rawPayload: { ...input, formVersion },
      meta,
    });

    // Conversion counter — only for brand-new leads from a page.
    if (landingPageId && !capture.duplicate) {
      prisma.landingPage
        .update({ where: { id: landingPageId }, data: { conversionCount: { increment: 1 } } })
        .catch((err) => logger.warn({ err }, 'conversion count increment failed'));
    }
    return capture;
  },

  async chatbot(input: ChatbotIntakeInput, meta: ClientMeta): Promise<CaptureResult> {
    const result = await captureLead({
      channel: 'chatbot',
      sourceSlug: 'chatbot',
      contact: input,
      attribution: input,
      rawPayload: input,
      meta,
    });
    // Link/refresh the chatbot session transcript.
    await prisma.chatbotSession.upsert({
      where: { sessionId: input.sessionId },
      update: {
        transcript: (input.transcript ?? undefined) as Prisma.InputJsonValue,
        botVersion: input.botVersion,
        ...(result.duplicate ? {} : { leadId: result.leadId }),
      },
      create: {
        sessionId: input.sessionId,
        botVersion: input.botVersion,
        transcript: (input.transcript ?? undefined) as Prisma.InputJsonValue,
        leadId: result.leadId,
      },
    });
    return result;
  },

  social(platform: string, input: SocialIntakeInput, meta: ClientMeta): Promise<CaptureResult> {
    return captureLead({
      channel: `social:${platform}`,
      sourceSlug: platform,
      contact: input,
      attribution: {
        ...input,
        utmSource: input.utmSource ?? platform,
        utmMedium: input.utmMedium ?? 'paid-social',
        utmCampaign: input.utmCampaign ?? input.campaignName,
      },
      rawPayload: input.raw ?? input,
      meta,
    });
  },
};
