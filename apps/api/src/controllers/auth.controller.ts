import type { GoogleLoginRequest, LoginRequest, RegisterRequest } from '@libro/shared';
import type { Request, RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from '../lib/cookies.js';
import { getInput } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';
import type { AuthService, RequestMeta } from '../services/auth.service.js';
import type { GoogleVerifier } from '../services/google.service.js';

type CookieEnv = Pick<Env, 'NODE_ENV' | 'COOKIE_DOMAIN'>;

function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

function refreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

export function createAuthController(auth: AuthService, env: CookieEnv, google?: GoogleVerifier) {
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

  const googleLogin: RequestHandler = async (req, res) => {
    if (!google) throw new AppError('NOT_FOUND', 'El ingreso con Google no está disponible.');
    const { body } = getInput<GoogleLoginRequest>(res);
    const profile = await google.verify(body.credential);
    if (!profile) {
      throw new AppError(
        'AUTH_INVALID',
        'No pudimos iniciar sesión con Google. Inténtalo de nuevo.',
      );
    }
    const { user, session } = await auth.loginWithGoogle(profile, requestMeta(req));
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

  return { register, login, googleLogin, refresh, logout };
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
