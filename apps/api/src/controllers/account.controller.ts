import type { ChangePasswordRequest, MessageResponse, UpdateProfileRequest } from '@libro/shared';
import type { Request, RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import { setSessionCookies } from '../lib/cookies.js';
import { getAuth } from '../middleware/auth.js';
import { getInput } from '../middleware/validate.js';
import type { AccountService } from '../services/account.service.js';
import type { RequestMeta } from '../services/auth.service.js';

type CookieEnv = Pick<Env, 'NODE_ENV' | 'COOKIE_DOMAIN'>;

function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

export function createAccountController(account: AccountService, env: CookieEnv) {
  const getMe: RequestHandler = async (_req, res) => {
    res.json({ user: await account.getProfile(getAuth(res).userId) });
  };

  const updateMe: RequestHandler = async (_req, res) => {
    const { body } = getInput<UpdateProfileRequest>(res);
    res.json({ user: await account.updateName(getAuth(res).userId, body.name) });
  };

  const changePassword: RequestHandler = async (req, res) => {
    const { body } = getInput<ChangePasswordRequest>(res);
    const { session } = await account.changePassword(getAuth(res).userId, body, requestMeta(req));
    setSessionCookies(res, env, session); // las demás sesiones se cerraron; esta continúa con tokens nuevos
    const response: MessageResponse = { message: 'Tu contraseña se actualizó.' };
    res.json(response);
  };

  return { getMe, updateMe, changePassword };
}
