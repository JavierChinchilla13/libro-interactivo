import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import type { ApiError } from '@libro/shared';

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
  message?: string;
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
    handler: (_req, res) => {
      res.status(429).json(body);
    },
  });
}
