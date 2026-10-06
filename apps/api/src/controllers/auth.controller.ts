import type { LoginRequest, RegisterRequest } from '@libro/shared';
import type { Request, RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from '../lib/cookies.js';
import { getInput } from '../middleware/validate.js';
import type { AuthService, RequestMeta } from '../services/auth.service.js';

type CookieEnv = Pick<Env, 'NODE_ENV' | 'COOKIE_DOMAIN'>;

function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

function refreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

export function createAuthController(auth: AuthService, env: CookieEnv) {
  const register: RequestHandler = async (req, res) => {
    const { body } = getInput<RegisterRequest>(res);
    const { user, session } = await auth.register(body, requestMeta(req));
    setSessionCookies(res, env, session);
    res.status(201).json({ user });
  };

  const login: RequestHandler = async (req, res) => {
    const { body } = getInput<LoginRequest>(res);
    const { user, session } = await auth.login(body, requestMeta(req));
    setSessionCookies(res, env, session);
    res.json({ user });
  };

  const refresh: RequestHandler = async (req, res) => {
    try {
      const { user, session } = await auth.refresh(refreshCookie(req), requestMeta(req));
      setSessionCookies(res, env, session);
      res.json({ user });
    } catch (error) {
      clearSessionCookies(res, env);
      throw error;
    }
  };

  const logout: RequestHandler = async (req, res) => {
    await auth.logout(refreshCookie(req));
    clearSessionCookies(res, env);
    res.status(204).end();
  };

  return { register, login, refresh, logout };
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
