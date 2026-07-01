import { prisma } from '../../core/database/prisma';

const userWithRole = {
  role: { include: { permissions: { include: { permission: true } } } },
  office: true,
} as const;

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: userWithRole,
    });
  },

  findUserById(id: string) {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: userWithRole,
    });
  },

  recordSuccessfulLogin(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
  },

  recordFailedLogin(userId: string, lockedUntil: Date | null) {
    return prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 }, lockedUntil },
    });
  },

  createRefreshToken(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }) {
    return prisma.refreshToken.create({ data });
  },

  findRefreshToken(id: string) {
    return prisma.refreshToken.findUnique({ where: { id } });
  },

  revokeRefreshToken(id: string, replacedBy?: string) {
    return prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedBy: replacedBy ?? null },
    });
  },

  revokeAllUserRefreshTokens(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  createSession(data: { userId: string; ip?: string; userAgent?: string }) {
    return prisma.userSession.create({ data });
  },
};

export type UserWithRole = NonNullable<Awaited<ReturnType<typeof authRepository.findUserById>>>;
