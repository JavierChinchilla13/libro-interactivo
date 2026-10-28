import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import type { ApiError } from '@libro/shared';

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
  message?: string;
  /**
   * Por quién se cuenta: por IP (por defecto) o por usuaria con sesión (rutas del panel: una editora que guarda sin
   * parar no gasta el cupo de otra persona de la misma red). Sin sesión cae a la IP.
   */
  by?: 'ip' | 'user';
  /** Parte extra de la clave (p. ej. el propósito de una subida), para que cada una tenga su propio cupo. */
  keyPart?: (req: Request) => string;
}

/** Limitador por IP (memoria; suficiente con una sola instancia). Responde con el formato de error estándar. */
export function createRateLimiter(options: RateLimitOptions): RateLimitRequestHandler {
  const body: ApiError = {
    error: {
      code: 'RATE_LIMITED',
      message: options.message ?? 'Demasiados intentos. Inténtalo de nuevo más tarde.',
    },
  };
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req: Request, res: Response) => {
      const auth = res.locals['auth'] as { userId?: string } | undefined;
      const base =
        options.by === 'user' && auth?.userId ? `u:${auth.userId}` : ipKeyGenerator(req.ip ?? '');
      return options.keyPart ? `${base}|${options.keyPart(req)}` : base;
    },
    handler: (_req, res) => {
      res.status(429).json(body);
    },
  });
}
