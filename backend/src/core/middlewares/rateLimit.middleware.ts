import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../cache/redis';
import { env } from '../config/env';

// Use Redis-backed store when available; otherwise undefined => express-rate-limit
// falls back to its built-in in-memory store (fine for single-node dev).
function store(prefix: string) {
  if (redis.status !== 'ready') return undefined;
  return new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<never>,
    prefix,
  });
}

export const globalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: store('rl:global:'),
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' } },
});

// Stricter limiter for auth + public intake endpoints.
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: store('rl:auth:'),
  message: { success: false, error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, slow down' } },
});
