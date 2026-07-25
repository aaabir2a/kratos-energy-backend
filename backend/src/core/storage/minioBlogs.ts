import { Client } from 'minio';
import { env } from '../config/env';
import { logger } from '../logger/logger';

// Use same minio client credentials, but a different bucket
export const minio = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

const BUCKET = env.MINIO_BLOGS_BUCKET || 'blogs';

export function minioConfigured(): boolean {
  return Boolean(env.MINIO_ENDPOINT && env.MINIO_ACCESS_KEY && env.MINIO_SECRET_KEY);
}

export function blogPublicUrl(key: string): string {
  const base = env.MINIO_PUBLIC_BASE_URL.replace(/\/$/, '');
  if (base) return `${base}/${BUCKET}/${key}`;
  const proto = env.MINIO_USE_SSL ? 'https' : 'http';
  return `${proto}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${BUCKET}/${key}`;
}

let ensured = false;
export async function ensureBlogsBucket(): Promise<void> {
  if (ensured || !minioConfigured()) return;
  const exists = await minio.bucketExists(BUCKET).catch(() => false);
  if (!exists) {
    await minio.makeBucket(BUCKET);
  }
  // Public read policy for everything in this bucket
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${BUCKET}/*`],
      },
    ],
  };
  await minio.setBucketPolicy(BUCKET, JSON.stringify(policy)).catch((err) => {
    logger.warn({ err: (err as Error).message }, 'Could not set blogs bucket policy');
  });
  ensured = true;
}

export async function putBlogObject(key: string, buf: Buffer, contentType: string): Promise<void> {
  await ensureBlogsBucket();
  await minio.putObject(BUCKET, key, buf, buf.length, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
}

export async function removeBlogObject(key: string): Promise<void> {
  await minio.removeObject(BUCKET, key).catch((err) => {
    logger.warn({ err: (err as Error).message, key }, 'minio remove blog object failed');
  });
}
