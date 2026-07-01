import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../logger/logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  connectTimeout: 2000,
  // Give up reconnecting after a few attempts in dev so logs stay quiet.
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
});

let warned = false;
redis.on('error', (err) => {
  // Avoid log spam when Redis is simply not running in dev.
  if (!warned) {
    logger.warn({ err: (err as Error).message }, 'Redis unavailable — degraded mode (memory fallbacks)');
    warned = true;
  }
});
redis.on('ready', () => logger.info('Redis connected'));

export let redisReady = false;

// Best-effort connect. App continues without Redis (rate-limit falls back to memory).
export async function connectRedis(): Promise<void> {
  try {
    if (redis.status === 'ready' || redis.status === 'connecting') return;
    await Promise.race([
      redis.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('redis connect timeout')), 2500)),
    ]);
    redisReady = true;
  } catch {
    redisReady = false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis.status === 'ready') await redis.quit();
}
