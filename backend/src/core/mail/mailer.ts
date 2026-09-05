import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { env } from '../config/env';
import { logger } from '../logger/logger';

// Email is optional: with no provider configured the app runs fine and simply
// skips sending (in-app notifications still work).
//
// Two providers are supported. Resend is preferred — it signs with DKIM and
// publishes SPF for the verified domain, which is what keeps these out of spam.
// SMTP is kept as a fallback so an existing deployment keeps working unchanged.
export type MailProvider = 'resend' | 'smtp' | 'none';

export function mailProvider(): MailProvider {
  const hasResend = Boolean(env.RESEND_API_KEY);
  const hasSmtp = Boolean(env.SMTP_HOST && env.SMTP_USER);
  if (env.MAIL_PROVIDER === 'resend') return hasResend ? 'resend' : 'none';
  if (env.MAIL_PROVIDER === 'smtp') return hasSmtp ? 'smtp' : 'none';
  if (hasResend) return 'resend';
  return hasSmtp ? 'smtp' : 'none';
}

export function mailConfigured(): boolean {
  return mailProvider() !== 'none';
}

let transport: Transporter | null = null;
function getTransport(): Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE, // true => 465, false => 587 STARTTLS
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transport;
}

let resendClient: Resend | null = null;
function getResend(): Resend {
  if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
}

const from = () => env.MAIL_FROM || env.SMTP_USER;

// Every mail carries a plain-text alternative. A multipart message scores far
// better with spam filters than HTML alone.
function toText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|tr|h1|h2|h3)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  // Distinct value per notified entity (e.g. a lead id). Gmail collapses
  // messages it considers identical; this keeps each alert its own thread.
  entityRef?: string;
  // Resend tag for filtering in their dashboard, e.g. 'lead.created'.
  tag?: string;
}

// Outcome of a send attempt. `ok` is the old boolean return, so existing
// truthiness checks on the result keep working; `messageId` is what the
// delivery log and bounce webhooks correlate on.
export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  provider: MailProvider;
}

// Best-effort send: never throws to the caller (a failed email must not fail the
// business action). Resolves with the provider's message id when accepted.
export async function sendMail(mail: Mail): Promise<SendResult> {
  const recipients = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter(Boolean);
  const provider = mailProvider();
  if (!recipients.length) return { ok: false, error: 'no recipients', provider };

  if (provider === 'none') {
    logger.warn({ subject: mail.subject }, 'Email skipped — no mail provider configured');
    return { ok: false, error: 'no provider configured', provider };
  }

  const text = mail.text ?? toText(mail.html);
  const headers: Record<string, string> = {};
  if (mail.entityRef) headers['X-Entity-Ref-ID'] = mail.entityRef;

  try {
    if (provider === 'resend') {
      const { data, error } = await getResend().emails.send({
        from: from(),
        to: recipients,
        subject: mail.subject,
        html: mail.html,
        text,
        ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
        ...(mail.tag ? { tags: [{ name: 'type', value: mail.tag.replace(/[^\w-]/g, '_') }] } : {}),
      });
      // The SDK reports failures in `error` rather than throwing.
      if (error) {
        logger.error({ err: error.message, name: error.name, subject: mail.subject }, 'Email send failed');
        return { ok: false, error: error.message, provider };
      }
      logger.info({ messageId: data?.id, to: recipients, provider }, 'Email sent');
      return { ok: true, messageId: data?.id, provider };
    }

    const info = await getTransport().sendMail({
      from: from(),
      to: recipients.join(', '),
      ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
      subject: mail.subject,
      html: mail.html,
      text,
      ...(Object.keys(headers).length ? { headers } : {}),
    });
    logger.info({ messageId: info.messageId, to: recipients, provider }, 'Email sent');
    return { ok: true, messageId: info.messageId, provider };
  } catch (err) {
    const message = (err as Error).message;
    logger.error({ err: message, subject: mail.subject, provider }, 'Email send failed');
    return { ok: false, error: message, provider };
  }
}

// Startup check so a broken key/password is obvious the same day rather than
// discovered weeks later through a missing notification. Never throws.
export async function verifyMailConfig(): Promise<void> {
  const provider = mailProvider();
  if (provider === 'none') {
    logger.warn('Mail: no provider configured — notification emails are disabled (in-app still works)');
    return;
  }
  if (!from()) {
    logger.error('Mail: MAIL_FROM is empty — set it to an address on your verified domain');
    return;
  }
  try {
    if (provider === 'resend') {
      // Cheapest authenticated call that proves the key works. A sending-only
      // key is refused here ("restricted to only send emails") — that key is
      // valid for our purposes, so treat it as a pass rather than an error.
      const { error } = await getResend().domains.list();
      if (error && !/restricted/i.test(error.message)) {
        logger.error({ err: error.message }, 'Mail: Resend API key rejected — notification emails will fail');
        return;
      }
      if (error) {
        logger.info({ from: from() }, 'Mail: Resend ready (send-only key — domain list not permitted)');
        return;
      }
    } else {
      await getTransport().verify();
    }
    logger.info({ provider, from: from() }, 'Mail: provider ready');
  } catch (err) {
    logger.error({ err: (err as Error).message, provider }, 'Mail: provider check failed — notification emails will fail');
  }
}
