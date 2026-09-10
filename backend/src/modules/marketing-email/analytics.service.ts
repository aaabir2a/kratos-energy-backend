import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';

/**
 * Campaign analytics, aggregated over message_events.
 *
 * Two rules run through all of it.
 *
 * Rates are always over what was **sent**, never over what was delivered.
 * Delivery is only known from the provider webhook, and if that is not
 * configured the delivered count is zero — a rate over it would be either a
 * division by zero or a wildly flattering number. Delivered is reported beside
 * the rates as its own count, so its absence is visible rather than silently
 * distorting everything.
 *
 * Opens and clicks are counted **per message, by people only**. Scanners open
 * everything, so a machine event is recorded but never counted here; and a
 * mail client that redraws the reading pane must not turn one reader into
 * three, so the unit is the message rather than the event.
 */

export interface CampaignStats {
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  failed: number;
  skipped: number;
  pending: number;
  /** Opens we attributed to software rather than a person. */
  machineOpens: number;
  rates: { openRate: number; clickRate: number; bounceRate: number; unsubscribeRate: number };
  /** True when nothing is filling delivered/bounced, so the UI can say why. */
  deliveryEventsMissing: boolean;
}

const EMPTY: CampaignStats = {
  recipients: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0,
  complained: 0, unsubscribed: 0, failed: 0, skipped: 0, pending: 0, machineOpens: 0,
  rates: { openRate: 0, clickRate: 0, bounceRate: 0, unsubscribeRate: 0 },
  deliveryEventsMissing: false,
};

/** One decimal place, and never a rate over an empty denominator. */
function rate(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

interface EventCounts {
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  machineOpens: number;
}

/**
 * Distinct messages per event type, for one batch or across all of them.
 *
 * Written as one grouped query rather than six counts: this runs on every
 * campaign row of the analytics table, and six round trips per row would make
 * a twenty-campaign page eat a hundred and twenty queries.
 */
async function countEvents(where: Prisma.Sql): Promise<EventCounts> {
  const rows = await prisma.$queryRaw<{ type: string; machine: boolean; n: bigint }[]>(Prisma.sql`
    SELECT e.type::text AS type, e.machine, count(DISTINCT e.message_id)::bigint AS n
      FROM message_events e
      JOIN scheduled_messages m ON m.id = e.message_id
     WHERE ${where}
     GROUP BY e.type, e.machine
  `);

  const pick = (type: string, machine: boolean) =>
    Number(rows.find((r) => r.type === type && r.machine === machine)?.n ?? 0);
  // A bounce or an unsubscribe is a fact about the address, not a viewing, so
  // the machine flag is irrelevant to it — sum both.
  const either = (type: string) => pick(type, false) + pick(type, true);

  return {
    delivered: either('DELIVERED'),
    opened: pick('OPENED', false),
    machineOpens: pick('OPENED', true),
    clicked: pick('CLICKED', false),
    bounced: either('BOUNCED'),
    complained: either('COMPLAINED'),
    unsubscribed: either('UNSUBSCRIBED'),
  };
}

function assemble(
  statuses: { status: string; n: number }[],
  events: EventCounts,
): CampaignStats {
  const by = (s: string) => statuses.find((r) => r.status === s)?.n ?? 0;
  const sent = by('SENT');
  const recipients = statuses.reduce((total, r) => total + r.n, 0);

  return {
    recipients,
    sent,
    delivered: events.delivered,
    opened: events.opened,
    clicked: events.clicked,
    bounced: events.bounced,
    complained: events.complained,
    unsubscribed: events.unsubscribed,
    machineOpens: events.machineOpens,
    failed: by('FAILED'),
    skipped: by('SKIPPED'),
    pending: by('PENDING') + by('SENDING'),
    rates: {
      openRate: rate(events.opened, sent),
      clickRate: rate(events.clicked, sent),
      bounceRate: rate(events.bounced, sent),
      unsubscribeRate: rate(events.unsubscribed, sent),
    },
    // Nothing was ever delivered *or* bounced despite sending — the provider
    // webhook is not wired up, rather than every message vanishing.
    deliveryEventsMissing: sent > 0 && events.delivered === 0 && events.bounced === 0,
  };
}

async function statusCounts(where: Prisma.Sql): Promise<{ status: string; n: number }[]> {
  const rows = await prisma.$queryRaw<{ status: string; n: bigint }[]>(Prisma.sql`
    SELECT m.status::text AS status, count(*)::bigint AS n
      FROM scheduled_messages m
     WHERE ${where}
     GROUP BY m.status
  `);
  return rows.map((r) => ({ status: r.status, n: Number(r.n) }));
}

export const analyticsService = {
  /** Everything about one campaign. Returns zeroes for one that never sent. */
  async campaign(campaignId: string): Promise<CampaignStats> {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      select: { batchId: true },
    });
    if (!campaign?.batchId) return EMPTY;

    const scope = Prisma.sql`m.batch_id = ${campaign.batchId}::uuid`;
    const [statuses, events] = await Promise.all([statusCounts(scope), countEvents(scope)]);
    return assemble(statuses, events);
  },

  /** The links people actually followed, most-clicked first. */
  async links(campaignId: string, limit = 20) {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: campaignId },
      select: { batchId: true },
    });
    if (!campaign?.batchId) return [];

    const rows = await prisma.$queryRaw<{ url: string; clicks: bigint; people: bigint }[]>(Prisma.sql`
      SELECT e.url,
             count(*)::bigint AS clicks,
             count(DISTINCT e.message_id)::bigint AS people
        FROM message_events e
        JOIN scheduled_messages m ON m.id = e.message_id
       WHERE m.batch_id = ${campaign.batchId}::uuid
         AND e.type = 'CLICKED' AND e.machine = false AND e.url IS NOT NULL
       GROUP BY e.url
       ORDER BY people DESC, clicks DESC
       LIMIT ${limit}
    `);
    return rows.map((r) => ({ url: r.url, clicks: Number(r.clicks), people: Number(r.people) }));
  },

  /** Campaigns that have sent, newest first, each with its numbers. */
  async campaigns(limit = 20) {
    const campaigns = await prisma.emailCampaign.findMany({
      where: { batchId: { not: null }, deletedAt: null },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true, name: true, status: true, startedAt: true, completedAt: true,
        batchId: true, template: { select: { name: true } },
      },
    });
    if (!campaigns.length) return [];

    // One pair of queries for every campaign on the page, then split by batch,
    // rather than a pair per campaign.
    const batchIds = campaigns.map((c) => c.batchId!);
    const scope = Prisma.sql`m.batch_id IN (${Prisma.join(batchIds.map((b) => Prisma.sql`${b}::uuid`))})`;

    const [statusRows, eventRows] = await Promise.all([
      prisma.$queryRaw<{ batch_id: string; status: string; n: bigint }[]>(Prisma.sql`
        SELECT m.batch_id::text AS batch_id, m.status::text AS status, count(*)::bigint AS n
          FROM scheduled_messages m WHERE ${scope} GROUP BY m.batch_id, m.status
      `),
      prisma.$queryRaw<{ batch_id: string; type: string; machine: boolean; n: bigint }[]>(Prisma.sql`
        SELECT m.batch_id::text AS batch_id, e.type::text AS type, e.machine,
               count(DISTINCT e.message_id)::bigint AS n
          FROM message_events e JOIN scheduled_messages m ON m.id = e.message_id
         WHERE ${scope} GROUP BY m.batch_id, e.type, e.machine
      `),
    ]);

    return campaigns.map((c) => {
      const statuses = statusRows
        .filter((r) => r.batch_id === c.batchId)
        .map((r) => ({ status: r.status, n: Number(r.n) }));
      const mine = eventRows.filter((r) => r.batch_id === c.batchId);
      const pick = (type: string, machine: boolean) =>
        Number(mine.find((r) => r.type === type && r.machine === machine)?.n ?? 0);
      const either = (type: string) => pick(type, false) + pick(type, true);

      const stats = assemble(statuses, {
        delivered: either('DELIVERED'),
        opened: pick('OPENED', false),
        machineOpens: pick('OPENED', true),
        clicked: pick('CLICKED', false),
        bounced: either('BOUNCED'),
        complained: either('COMPLAINED'),
        unsubscribed: either('UNSUBSCRIBED'),
      });

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        templateName: c.template?.name ?? null,
        startedAt: c.startedAt,
        completedAt: c.completedAt,
        stats,
      };
    });
  },

  /**
   * Send volume and engagement per day.
   *
   * Built off a generated date series so quiet days come back as zero rather
   * than being missing — a chart that silently closes a gap reads as if
   * nothing happened on either side of it.
   */
  async timeSeries(days = 30) {
    const rows = await prisma.$queryRaw<
      { day: Date; sent: bigint; opened: bigint; clicked: bigint }[]
    >(Prisma.sql`
      WITH span AS (
        SELECT generate_series(
          -- The ::int cast is load-bearing: the driver binds this as bigint and
          -- make_interval has no bigint overload.
          date_trunc('day', now()) - make_interval(days => ${days - 1}::int),
          date_trunc('day', now()),
          '1 day'
        ) AS day
      )
      SELECT span.day,
             (SELECT count(*) FROM scheduled_messages m
               WHERE m.status = 'SENT' AND date_trunc('day', m.sent_at) = span.day)::bigint AS sent,
             (SELECT count(DISTINCT e.message_id) FROM message_events e
               WHERE e.type = 'OPENED' AND e.machine = false
                 AND date_trunc('day', e.occurred_at) = span.day)::bigint AS opened,
             (SELECT count(DISTINCT e.message_id) FROM message_events e
               WHERE e.type = 'CLICKED' AND e.machine = false
                 AND date_trunc('day', e.occurred_at) = span.day)::bigint AS clicked
        FROM span ORDER BY span.day
    `);

    return rows.map((r) => ({
      day: r.day,
      sent: Number(r.sent),
      opened: Number(r.opened),
      clicked: Number(r.clicked),
    }));
  },

  /** The section's landing page: what is here, and how it is doing. */
  async overview(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000);

    const [lists, contacts, suppressed, campaignCount, recent, series] = await Promise.all([
      prisma.contactList.count({ where: { deletedAt: null } }),
      prisma.marketingContact.count({ where: { deletedAt: null } }),
      prisma.messageSuppression.count({ where: { channel: 'EMAIL' } }),
      prisma.emailCampaign.count({ where: { deletedAt: null } }),
      this.campaigns(5),
      this.timeSeries(days),
    ]);

    // Totals over the window, so the headline rate is not one campaign's.
    const scope = Prisma.sql`m.batch_id IS NOT NULL AND m.created_at >= ${since}`;
    const [statuses, events] = await Promise.all([statusCounts(scope), countEvents(scope)]);

    return {
      windowDays: days,
      lists,
      contacts,
      suppressed,
      campaigns: campaignCount,
      totals: assemble(statuses, events),
      recent,
      series,
    };
  },
};
