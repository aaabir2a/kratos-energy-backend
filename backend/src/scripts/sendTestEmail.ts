// Sends one test notification email through the configured provider, so a new
// API key / SMTP password can be verified without waiting for a real lead.
//
//   npm run mail:test -- you@example.com
//
// In Docker:  docker compose exec api node dist/scripts/sendTestEmail.js you@example.com
import { env } from '../core/config/env';
import { sendMail, mailProvider, verifyMailConfig } from '../core/mail/mailer';

async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: npm run mail:test -- you@example.com');
    process.exit(1);
  }

  console.log(`provider : ${mailProvider()}`);
  console.log(`from     : ${env.MAIL_FROM || '(unset — falls back to SMTP_USER)'}`);
  console.log(`reply-to : ${env.MAIL_REPLY_TO || '(none)'}`);
  await verifyMailConfig();

  const result = await sendMail({
    to,
    subject: 'Kratos CRM — test notification',
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px">
      <h1 style="font-size:18px;color:#0f172a">Test notification</h1>
      <p style="color:#334155;font-size:14px">If you can read this, the CRM can send email.</p>
      <p style="color:#334155;font-size:14px">Sent ${new Date().toISOString()} via ${mailProvider()}.</p>
    </div>`,
    entityRef: `test-${Date.now()}`,
    tag: 'test',
  });

  console.log(result.ok ? `✅ accepted by provider (id: ${result.messageId ?? 'n/a'})` : '❌ not sent — see the error above');
  process.exit(result.ok ? 0 : 1);
}

void main();
