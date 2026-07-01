import { createHash } from 'node:crypto';

// Fast one-way hash for opaque tokens stored at rest (refresh tokens).
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Parse a TTL string like "7d" / "15m" / "3600s" into milliseconds.
export function ttlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!m) return Number(ttl) || 0;
  const n = Number(m[1]);
  const unit = m[2];
  const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}
