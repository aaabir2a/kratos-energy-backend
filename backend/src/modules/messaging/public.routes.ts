import { Router, type Request, type Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../core/database/prisma';
import { env } from '../../core/config/env';
import { logger } from '../../core/logger/logger';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../core/middlewares/validate.middleware';
import { ok } from '../../shared/utils/response';
import { AppError } from '../../shared/errors/AppError';
import { outbox } from './outbox.service';
import { verifyUnsubscribeToken } from './unsubscribe';
import { verifyOpenToken, verifyClickToken } from './tracking';
import { trackingService, recordInBackground } from './tracking.service';

// Public, unauthenticated endpoints: the unsubscribe page a customer lands on
// from an email footer, and the provider's delivery webhook. Both are mounted
// before any auth middleware, so both do their own verification.

export const publicMessagingRouter = Router();

const tokenParam = z.object({ token: z.string().min(10).max(2000) });

/** Look up what a token refers to, so the page can name the address. */
publicMessagingRouter.get(
  '/unsubscribe/:token',
  validate({ params: tokenParam }),
  asyncHandler(async (req, res) => {
    const parsed = verifyUnsubscribeToken(req.params.token);
    // A bad token is "not found" rather than "invalid signature": there is
    // nothing useful to tell an anonymous caller about why it failed.
    if (!parsed) throw AppError.notFound('This unsubscribe link is not valid');

    const existing = await prisma.messageSuppression.findUnique({
      where: { channel_address: { channel: parsed.channel, address: parsed.address } },
    });
    ok(res, {
      address: parsed.address,
      channel: parsed.channel,
      unsubscribed: existing !== null,
    });
  }),
);

publicMessagingRouter.post(
  '/unsubscribe/:token',
  validate({ params: tokenParam }),
  asyncHandler(async (req, res) => {
    const parsed = verifyUnsubscribeToken(req.params.token);
    if (!parsed) throw AppError.notFound('This unsubscribe link is not valid');

    // suppress() also cancels anything already queued for the address, so a
    // sequence part-way through stops immediately rather than eventually.
    await outbox.suppress(parsed.channel, parsed.address, 'UNSUBSCRIBED', parsed.leadId ?? null);

    // Attribute it to the message that prompted it, when the link carries one:
    // which campaign drove people away is the number worth knowing. Links
    // minted before this existed simply do not attribute.
    if (parsed.messageId) {
      const exists = await prisma.scheduledMessage.findUnique({
        where: { id: parsed.messageId },
        select: { id: true },
      });
      const already =
        exists &&
        (await prisma.messageEvent.findFirst({
          where: { messageId: parsed.messageId, type: 'UNSUBSCRIBED' },
          select: { id: true },
        }));
      if (exists && !already) {
        await prisma.messageEvent.create({
          data: { messageId: parsed.messageId, type: 'UNSUBSCRIBED' },
        });
      }
    }

    logger.info({ channel: parsed.channel }, 'unsubscribe honoured');
    ok(res, { address: parsed.address, unsubscribed: true });
  }),
);

/** Mis-clicks happen, and re-subscribing has to be as easy as leaving. */
publicMessagingRouter.post(
  '/unsubscribe/:token/resubscribe',
  validate({ params: tokenParam }),
  asyncHandler(async (req, res) => {
    const parsed = verifyUnsubscribeToken(req.params.token);
    if (!parsed) throw AppError.notFound('This unsubscribe link is not valid');

    await prisma.messageSuppression.deleteMany({
      where: {
        channel: parsed.channel,
        address: parsed.address,
        // Only an unsubscribe can be undone here. A hard bounce or a spam
        // complaint must not be cleared by whoever holds the link.
        reason: 'UNSUBSCRIBED',
      },
    });
    ok(res, { address: parsed.address, unsubscribed: false });
  }),
);

// ── Open and click tracking ───────────────────────────

/**
 * A transparent 1×1 GIF, 43 bytes. Held as a constant rather than read from
 * disk so the endpoint cannot fail on a missing file.
 */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function sendPixel(res: Response): void {
  res
    .status(200)
    .set({
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      // Every open must reach us, so nothing may be cached anywhere.
      'Cache-Control': 'no-store, no-cache, must-revalidate, private, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    })
    .end(PIXEL);
}

/**
 * The open pixel. Always answers with the image — a bad, expired or tampered
 * token returns exactly the same 43 bytes as a good one. A broken image in a
 * customer's inbox is a worse outcome than a missed statistic, and answering
 * differently would let anyone probe which tokens are real.
 */
publicMessagingRouter.get('/t/o/:token', (req, res) => {
  const parsed = verifyOpenToken(req.params.token);
  if (parsed) {
    // Not awaited: the image goes back now, the write happens behind it.
    recordInBackground(
      trackingService.recordOpen(parsed.messageId, req.header('user-agent')),
      'open',
    );
  }
  sendPixel(res);
});

/**
 * The click redirect.
 *
 * A token that does not verify is sent to the site's home page, never to a URL
 * taken from the token itself — the destination is only trustworthy because the
 * signature proves we minted it. Redirecting to unverified input would turn this
 * host into an open redirect for phishing, which is a worse problem than the
 * unreachable link it would be papering over.
 */
publicMessagingRouter.get('/t/c/:token', (req, res) => {
  const parsed = verifyClickToken(req.params.token);

  if (!parsed) {
    logger.warn({ ip: req.ip }, 'tracking: click token failed verification');
    const fallback = env.APP_BASE_URL || 'https://kratos-energy.com';
    res.redirect(302, fallback);
    return;
  }

  recordInBackground(
    trackingService.recordClick(parsed.messageId, parsed.url, req.header('user-agent')),
    'click',
  );
  // 302, not 301: a permanent redirect would be cached by the browser and the
  // second click would never reach us.
  res.redirect(302, parsed.url);
});

// ── Provider delivery webhook ─────────────────────────

/**
 * Resend signs with Svix: the signed content is `${id}.${timestamp}.${body}`
 * and the secret is base64 after the `whsec_` prefix. A plain
 * `x-webhook-signature` HMAC is also accepted, for a provider that uses the
 * simpler scheme.
 */
function verifyWebhook(req: Request): boolean {
  const secret = env.MAIL_WEBHOOK_SECRET;
  if (!secret) return false; // unconfigured → reject, never accept blindly
  const raw = (req as { rawBody?: Buffer }).rawBody;
  if (!raw) return false;

  const svixId = req.header('svix-id');
  const svixTimestamp = req.header('svix-timestamp');
  const svixSignature = req.header('svix-signature');

  if (svixId && svixTimestamp && svixSignature) {
    // Reject anything older than five minutes, so a captured request cannot be
    // replayed later.
    const age = Math.abs(Date.now() / 1000 - Number(svixTimestamp));
    if (!Number.isFinite(age) || age > 300) return false;

    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const signed = `${svixId}.${svixTimestamp}.${raw.toString('utf8')}`;
    const expected = createHmac('sha256', key).update(signed).digest('base64');
    // The header carries one or more space-separated `v1,<sig>` pairs.
    return svixSignature
      .split(' ')
      .map((part) => part.split(',')[1])
      .some((sig) => {
        if (!sig) return false;
        const a = Buffer.from(expected);
        const b = Buffer.from(sig);
        return a.length === b.length && timingSafeEqual(a, b);
      });
  }

  const header = req.header('x-webhook-signature');
  if (!header) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

const EVENT_MAP: Record<string, 'DELIVERED' | 'OPENED' | 'CLICKED' | 'BOUNCED' | 'COMPLAINED' | 'FAILED'> = {
  'email.delivered': 'DELIVERED',
  'email.opened': 'OPENED',
  'email.clicked': 'CLICKED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINED',
  'email.delivery_delayed': 'FAILED',
};

publicMessagingRouter.post(
  '/webhooks/mail',
  asyncHandler(async (req, res) => {
    if (!verifyWebhook(req)) throw AppError.unauthorized('Invalid webhook signature');

    const body = req.body as { type?: string; data?: { email_id?: string; to?: string | string[] } };
    const type = EVENT_MAP[body.type ?? ''];
    const providerMessageId = body.data?.email_id;

    // Unknown event types are acknowledged rather than retried forever.
    if (!type || !providerMessageId) return ok(res, { received: true, ignored: true });

    const message = await prisma.scheduledMessage.findFirst({
      where: { providerMessageId },
      select: { id: true, leadId: true, toEmail: true },
    });

    if (message) {
      // svix-id makes a redelivered webhook a no-op rather than a double count.
      const providerEventId = req.header('svix-id') ?? null;
      const already = providerEventId
        ? await prisma.messageEvent.findUnique({ where: { providerEventId } })
        : null;
      if (!already) {
        await prisma.messageEvent.create({
          data: { messageId: message.id, type, detail: body.type, providerEventId },
        });
      }
    }

    // A bounce or a complaint stops future sending regardless of whether we
    // still hold the original message row.
    const address =
      message?.toEmail ?? (Array.isArray(body.data?.to) ? body.data?.to[0] : body.data?.to) ?? null;
    if (address && (type === 'BOUNCED' || type === 'COMPLAINED')) {
      await outbox.suppress('EMAIL', address, type === 'BOUNCED' ? 'BOUNCED' : 'COMPLAINED', message?.leadId ?? null);
      logger.warn({ type, providerMessageId }, 'address suppressed by provider event');
    }

    ok(res, { received: true });
  }),
);
