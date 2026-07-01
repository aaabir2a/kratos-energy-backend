import type { Request, Response } from 'express';
import { ok } from '../../shared/utils/response';
import { authService } from './auth.service';

function clientMeta(req: Request) {
  return { ip: req.ip, userAgent: req.header('user-agent') ?? undefined };
}

export const authController = {
  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    const result = await authService.login(email, password, clientMeta(req));
    ok(res, result);
  },

  async refresh(req: Request, res: Response) {
    const result = await authService.refresh(req.body.refreshToken, clientMeta(req));
    ok(res, result);
  },

  async logout(req: Request, res: Response) {
    await authService.logout(req.body.refreshToken);
    ok(res, { message: 'Logged out' });
  },

  async me(req: Request, res: Response) {
    const user = await authService.me(req.auth!.userId);
    ok(res, user);
  },
};
