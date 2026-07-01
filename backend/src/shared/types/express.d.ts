import type { AccessTokenPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      auth?: {
        userId: string;
        officeId: string | null;
        role: string;
        permissions: string[];
      };
    }
  }
}

export {};
