import type { Request, RequestHandler, Response } from 'express';
import type { Role } from '@libro/shared';
import { ACCESS_COOKIE } from '../lib/cookies.js';
import { AppError } from '../lib/errors.js';
import type { AuthContext, AuthService } from '../services/auth.service.js';

/** Contexto del usuario autenticado, disponible tras `requireAuth`. */
export function getAuth(res: Response): AuthContext {
  const ctx = res.locals['auth'] as AuthContext | undefined;
  if (!ctx) throw new AppError('UNAUTHENTICATED', 'Debes iniciar sesión');
  return ctx;
}

function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Contexto del usuario si hay sesión válida; `undefined` para un visitante (rutas con `optionalAuth`). */
export function getOptionalAuth(res: Response): AuthContext | undefined {
  return res.locals['auth'] as AuthContext | undefined;
}

export interface Guards {
  /**
   * Para rutas públicas que cambian según quién pregunta (p. ej. la wiki): si hay sesión válida la deja en el
   * contexto; si no hay, o es inválida, sigue como visitante sin dar error.
   */
  optionalAuth: RequestHandler;
  /** Exige sesión válida (access token vigente, usuario activo y versión de tokens al día). */
  requireAuth: RequestHandler;
  /**
   * Exige uno de los roles indicados (lista explícita: ADMIN no se asume incluido).
   * Debe ir después de `requireAuth`.
   */
  requireRole: (...roles: Role[]) => RequestHandler;
}

export function createGuards(auth: AuthService): Guards {
  const requireAuth: RequestHandler = async (req, res, next) => {
    const token = readCookie(req, ACCESS_COOKIE);
    if (!token) throw new AppError('UNAUTHENTICATED', 'Debes iniciar sesión');
    const ctx = await auth.authenticate(token);
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'Tu sesión no es válida o caducó');
    res.locals['auth'] = ctx;
    next();
  };

  const optionalAuth: RequestHandler = async (req, res, next) => {
    const token = readCookie(req, ACCESS_COOKIE);
    if (token) {
      const ctx = await auth.authenticate(token);
      if (ctx) res.locals['auth'] = ctx;
    }
    next();
  };

  const requireRole =
    (...roles: Role[]): RequestHandler =>
    (_req, res, next) => {
      const ctx = getAuth(res);
      if (!roles.includes(ctx.role)) {
        throw new AppError('FORBIDDEN', 'No tienes permiso para realizar esta acción');
      }
      next();
    };

  return { requireAuth, optionalAuth, requireRole };
}
