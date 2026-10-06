import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env.js';
import type { Session } from '../services/auth.service.js';

export const ACCESS_COOKIE = 'libro_at';
export const REFRESH_COOKIE = 'libro_rt';

type CookieEnv = Pick<Env, 'NODE_ENV' | 'COOKIE_DOMAIN'>;

function baseOptions(env: CookieEnv, path: string): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

// El access token viaja en todo /api; el refresh solo en /api/auth (menos exposición).
const ACCESS_PATH = '/api';
const REFRESH_PATH = '/api/auth';

export function setSessionCookies(res: Response, env: CookieEnv, session: Session): void {
  res.cookie(ACCESS_COOKIE, session.accessToken, {
    ...baseOptions(env, ACCESS_PATH),
    expires: session.accessExpiresAt,
  });
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...baseOptions(env, REFRESH_PATH),
    expires: session.refreshExpiresAt,
  });
}

export function clearSessionCookies(res: Response, env: CookieEnv): void {
  res.clearCookie(ACCESS_COOKIE, baseOptions(env, ACCESS_PATH));
  res.clearCookie(REFRESH_COOKIE, baseOptions(env, REFRESH_PATH));
}
