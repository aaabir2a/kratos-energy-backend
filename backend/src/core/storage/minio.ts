import { Client } from 'minio';
import { env } from '../config/env';
import { logger } from '../logger/logger';

export const minio = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

export function minioConfigured(): boolean {
  return Boolean(env.MINIO_ENDPOINT && env.MINIO_ACCESS_KEY && env.MINIO_SECRET_KEY);
}

// Direct URL — bucket policy makes hero/* public-read, so the website can
// hot-link these (cacheable, no presign expiry).
export function publicUrl(key: string): string {
  const proto = env.MINIO_USE_SSL ? 'https' : 'http';
  return `${proto}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${env.MINIO_BUCKET}/${key}`;
}

let ensured = false;
export async function ensureBucket(): Promise<void> {
  if (ensured || !minioConfigured()) return;
  const bucket = env.MINIO_BUCKET;
  const exists = await minio.bucketExists(bucket).catch(() => false);
  if (!exists) await minio.makeBucket(bucket);
  // Public read for the website-served prefixes (hero banners + catalog images).
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/hero/*`, `arn:aws:s3:::${bucket}/catalog/*`],
      },
    ],
  };
  await minio.setBucketPolicy(bucket, JSON.stringify(policy)).catch((err) => {
    logger.warn({ err: (err as Error).message }, 'Could not set bucket policy (public images may 403)');
  });
  ensured = true;
}

export async function putObject(key: string, buf: Buffer, contentType: string): Promise<void> {
  await ensureBucket();
  await minio.putObject(env.MINIO_BUCKET, key, buf, buf.length, {
    'Content-Type': contentType,
    // Immutable content-addressed keys → let browsers/CDNs cache forever.
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
}

export async function removeObject(key: string): Promise<void> {
  await minio.removeObject(env.MINIO_BUCKET, key).catch((err) => {
    logger.warn({ err: (err as Error).message, key }, 'minio remove failed');
  });
}
