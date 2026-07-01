import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../core/config/env';

export interface AccessTokenPayload {
  sub: string; // userId
  officeId: string | null;
  role: string; // role slug
  permissions: string[]; // permission slugs
}

export interface RefreshTokenPayload {
  sub: string; // userId
  jti: string; // token id (matches RefreshToken.id)
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
