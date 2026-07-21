import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_NAME: z.string().default('Kratos CRM API'),
  API_PREFIX: z.string().default('/api/v1'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  INTAKE_WEBHOOK_SECRET: z.string().min(16).default('dev_webhook_secret_change_me'),

  // MinIO object storage (hero images etc.)
  MINIO_ENDPOINT: z.string().default(''),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  MINIO_ACCESS_KEY: z.string().default(''),
  MINIO_SECRET_KEY: z.string().default(''),
  MINIO_BUCKET: z.string().default('kratos-uploads'),
  // Public base for object URLs handed to browsers/websites. Set this to an
  // HTTPS origin (e.g. https://api.kratos-energy.com) so image URLs aren't
  // blocked as mixed content on an HTTPS page. Empty => derive from endpoint.
  MINIO_PUBLIC_BASE_URL: z.string().default(''),

  // Email notifications (Phase 7). Empty SMTP_HOST/USER => email disabled (in-app
  // notifications still work). Gmail: smtp.gmail.com:587 + a 16-char app password.
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'), // true for port 465
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default(''), // e.g. "Kratos Sustainability <kratossenergy@gmail.com>"
  MAIL_REPLY_TO: z.string().default(''), // optional Reply-To (e.g. info@kratos-energy.com)
  // CRM base URL used to build deep links in emails, e.g. https://crm.kratos-energy.com
  APP_BASE_URL: z.string().default(''),
  // Fallback shared recipients for admin notifications (comma-separated) until set in the UI.
  NOTIFY_ADMIN_EMAILS: z.string().default(''),

  // Chatbot platform (CRM_DEVELOPER_GUIDE.md). Key empty => integration disabled.
  CHATBOT_API_BASE: z.string().url().default('https://api.ambrosianuk.com'),
  CHATBOT_CRM_KEY: z.string().default(''),
  CHATBOT_WEBHOOK_SECRET: z.string().default(''),

  BCRYPT_ROUNDS: z.coerce.number().min(8).max(15).default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),

  SEED_ADMIN_EMAIL: z.string().email().default('admin@kratosenergy.com.au'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin@12345'),
  SEED_ADMIN_NAME: z.string().default('System Admin'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast on bad config.
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
// "*" (or empty) ⇒ reflect any Origin. Wildcard can't be a literal header value
// alongside credentials, so we echo the request Origin instead.
export const corsAllowAll = corsOrigins.includes('*') || corsOrigins.length === 0;
export const isProd = env.NODE_ENV === 'production';
