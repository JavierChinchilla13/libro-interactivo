import type { CookieOptions, Response } from 'express';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_COOKIE,
  HINT_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from './cookies.js';

interface Call {
  name: string;
  value?: string;
  options: CookieOptions;
}

/** Una respuesta falsa que anota qué cookies se pusieron y cuáles se borraron. */
function fakeResponse() {
  const set: Call[] = [];
  const cleared: Call[] = [];
  const res = {
    cookie: (name: string, value: string, options: CookieOptions) => {
      set.push({ name, value, options });
    },
    clearCookie: (name: string, options: CookieOptions) => {
      cleared.push({ name, options });
    },
  } as unknown as Response;
  return { res, set, cleared };
}

const session = {
  accessToken: 'acceso',
  accessExpiresAt: new Date('2026-10-29T12:15:00Z'),
  refreshToken: 'renovacion',
  refreshExpiresAt: new Date('2026-11-28T12:00:00Z'),
};

describe('cookie-pista de sesión', () => {
  it('se pone junto a la sesión: sin datos, legible por la página y con la vida del refresh', () => {
    const { res, set } = fakeResponse();
    setSessionCookies(res, { NODE_ENV: 'development', COOKIE_DOMAIN: undefined }, session);
    const hint = set.find((call) => call.name === HINT_COOKIE);
    expect(hint?.value).toBe('1');
    expect(hint?.options).toMatchObject({
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      expires: session.refreshExpiresAt,
      secure: false,
    });
    // Las cookies de verdad siguen httpOnly y con su ruta.
    expect(set.find((c) => c.name === ACCESS_COOKIE)?.options).toMatchObject({
      httpOnly: true,
      path: '/api',
    });
    expect(set.find((c) => c.name === REFRESH_COOKIE)?.options).toMatchObject({
      httpOnly: true,
      path: '/api/auth',
    });
  });

  it('en producción es Secure y respeta el dominio de las cookies', () => {
    const { res, set } = fakeResponse();
    setSessionCookies(
      res,
      { NODE_ENV: 'production', COOKIE_DOMAIN: '.universomemorias.com' },
      session,
    );
    expect(set.find((c) => c.name === HINT_COOKIE)?.options).toMatchObject({
      secure: true,
      domain: '.universomemorias.com',
      httpOnly: false,
    });
  });

  it('se borra con las demás al cerrar la sesión, con las mismas opciones con las que se puso', () => {
    const { res, cleared } = fakeResponse();
    clearSessionCookies(res, { NODE_ENV: 'production', COOKIE_DOMAIN: '.universomemorias.com' });
    expect(cleared.map((c) => c.name).sort()).toEqual(
      [ACCESS_COOKIE, HINT_COOKIE, REFRESH_COOKIE].sort(),
    );
    expect(cleared.find((c) => c.name === HINT_COOKIE)?.options).toMatchObject({
      path: '/',
      domain: '.universomemorias.com',
    });
  });
});
