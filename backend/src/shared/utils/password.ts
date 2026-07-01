import bcrypt from 'bcryptjs';
import { env } from '../../core/config/env';

// Note: production should prefer argon2id. bcryptjs chosen for zero native-build
// friction on Windows dev machines. Swap at hardening (Phase 9) if required.
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
