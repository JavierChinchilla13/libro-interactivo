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
import type { NewsletterService } from '../services/newsletter.service.js';

type CookieEnv = Pick<Env, 'NODE_ENV' | 'COOKIE_DOMAIN'>;

function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

function refreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

/**
 * La casilla de novedades viaja con los consentimientos y ya se validó (edad) antes de crear nada. Si se marcó, se
 * apunta después de entrar; si no, y es mayor de edad (vio la casilla y no la marcó), se da por respondida la
 * invitación del panel. Un fallo ahí nunca hace fallar el alta (la persona puede apuntarse desde la cuenta).
 */
export function createAuthController(
  auth: AuthService,
  env: CookieEnv,
  newsletter: NewsletterService,
  google?: GoogleVerifier,
) {
  const register: RequestHandler = async (req, res) => {
    const { body } = getInput<RegisterRequest>(res);
    const { user, session } = await auth.register(body, requestMeta(req));
    await newsletter.afterSignup(user.id, 'register', body.newsletter);
    setSessionCookies(res, env, session);
    res.status(201).json({ user });
  };

  const login: RequestHandler = async (req, res) => {
    const { body } = getInput<LoginRequest>(res);
    const result = await auth.login(body, requestMeta(req));
    if (result.status === 'needs_profile') {
      // Sin sesión: se pide volver a declarar la edad y los consentimientos antes de entrar.
      res.json({ status: 'needs_profile', name: result.name, email: result.email });
      return;
    }
    if (body.profile) {
      await newsletter.afterSignup(result.user.id, 'login', body.profile.newsletter);
    }
    setSessionCookies(res, env, result.session);
    res.json({ status: 'ok', user: result.user });
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
    const result = await auth.loginWithGoogle(profile, requestMeta(req), body.profile);
    if (result.status === 'needs_profile') {
      // Persona nueva: todavía no existe cuenta ni sesión. Se piden la edad y los consentimientos.
      res.json({ status: 'needs_profile', name: result.name, email: result.email });
      return;
    }
    if (body.profile) {
      await newsletter.afterSignup(result.user.id, 'google', body.profile.newsletter);
    }
    setSessionCookies(res, env, result.session);
    res.json({ status: 'ok', user: result.user });
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
