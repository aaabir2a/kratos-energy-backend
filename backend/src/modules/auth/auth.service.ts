import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/errors/AppError';
import { verifyPassword } from '../../shared/utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../shared/utils/jwt';
import { sha256, ttlToMs } from '../../shared/utils/token';
import { env } from '../../core/config/env';
import { authRepository } from './auth.repository';
import { resolvePermissions, toAuthUserDto, type AuthUserDto } from './auth.dto';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface AuthResult {
  user: AuthUserDto;
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(
  user: Awaited<ReturnType<typeof authRepository.findUserById>>,
  meta: ClientMeta,
): Promise<AuthResult> {
  if (!user) throw AppError.unauthorized();
  const permissions = resolvePermissions(user);

  const jti = randomUUID();
  const refreshToken = signRefreshToken({ sub: user.id, jti });
  await authRepository.createRefreshToken({
    id: jti,
    userId: user.id,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL)),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  const accessToken = signAccessToken({
    sub: user.id,
    officeId: user.officeId,
    role: user.role.slug,
    permissions,
  });

  return { user: toAuthUserDto(user, permissions), accessToken, refreshToken };
}

export const authService = {
  async login(email: string, password: string, meta: ClientMeta): Promise<AuthResult> {
    const user = await authRepository.findUserByEmail(email);
    // Constant-ish failure to avoid leaking which emails exist.
    if (!user) throw AppError.unauthorized('Invalid email or password');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError('TOO_MANY_REQUESTS', 'Account temporarily locked. Try again later.');
    }
    if (!user.isActive) throw AppError.forbidden('Account is disabled');

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      const willLock = user.failedLoginCount + 1 >= MAX_FAILED;
      await authRepository.recordFailedLogin(
        user.id,
        willLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      );
      throw AppError.unauthorized('Invalid email or password');
    }

    await authRepository.recordSuccessfulLogin(user.id);
    await authRepository.createSession({ userId: user.id, ip: meta.ip, userAgent: meta.userAgent });
    return issueTokens(user, meta);
  },

  async refresh(token: string, meta: ClientMeta): Promise<AuthResult> {
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    const stored = await authRepository.findRefreshToken(payload.jti);
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw AppError.unauthorized('Refresh token is no longer valid');
    }
    // Reuse / tampering detection.
    if (stored.tokenHash !== sha256(token)) {
      await authRepository.revokeAllUserRefreshTokens(payload.sub);
      throw AppError.unauthorized('Refresh token reuse detected; all sessions revoked');
    }

    const user = await authRepository.findUserById(payload.sub);
    if (!user || !user.isActive) throw AppError.unauthorized();

    const result = await issueTokens(user, meta);
    // Rotate: revoke old, link to new.
    const newJti = verifyRefreshToken(result.refreshToken).jti;
    await authRepository.revokeRefreshToken(stored.id, newJti);
    return result;
  },

  async logout(token: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(token);
      const stored = await authRepository.findRefreshToken(payload.jti);
      if (stored && !stored.revokedAt) await authRepository.revokeRefreshToken(stored.id);
    } catch {
      // Idempotent logout — swallow invalid tokens.
    }
  },

  async me(userId: string): Promise<AuthUserDto> {
    const user = await authRepository.findUserById(userId);
    if (!user) throw AppError.notFound('User not found');
    return toAuthUserDto(user, resolvePermissions(user));
  },
};
