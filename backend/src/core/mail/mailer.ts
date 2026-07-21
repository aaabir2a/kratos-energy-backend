import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../logger/logger';

// Email is optional: with no SMTP host/user configured the app runs fine and
// simply skips sending (in-app notifications still work).
export function mailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER);
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

const from = () => env.MAIL_FROM || env.SMTP_USER;

interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

// Best-effort send: never throws to the caller (a failed email must not fail the
// business action). Returns true if handed to the transport.
export async function sendMail(mail: Mail): Promise<boolean> {
  const recipients = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter(Boolean);
  if (!recipients.length) return false;
  if (!mailConfigured()) {
    logger.warn({ subject: mail.subject }, 'Email skipped — SMTP not configured');
    return false;
  }
  try {
    const info = await getTransport().sendMail({
      from: from(),
      to: recipients.join(', '),
      subject: mail.subject,
      html: mail.html,
      text: mail.text ?? mail.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
    logger.info({ messageId: info.messageId, to: recipients }, 'Email sent');
    return true;
  } catch (err) {
    logger.error({ err: (err as Error).message, subject: mail.subject }, 'Email send failed');
    return false;
  }
}
