import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { logger } from '../../core/logger/logger';
import { pickRoundRobinAssignee } from '../leads/assignment.service';
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
    return captureLead({
      channel: 'web',
      sourceSlug: input.sourceSlug ?? 'website',
      contact: input,
      attribution: input,
      customFields: input.customFields,
      message: input.message,
      rawPayload: input,
      meta,
    });
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
