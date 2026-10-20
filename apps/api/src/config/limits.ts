import type { RateLimitOptions } from '../middleware/rateLimit.js';

/** Límites de intentos por IP de los endpoints sensibles. */
export interface Limits {
  register: RateLimitOptions;
  login: RateLimitOptions;
  refresh: RateLimitOptions;
  changePassword: RateLimitOptions;
  forgotPassword: RateLimitOptions;
  resetPassword: RateLimitOptions;
  contact: RateLimitOptions;
  accessResolve: RateLimitOptions;
  accessRedeem: RateLimitOptions;
}

/** Multiplica el tope de cada límite (la ventana de tiempo no cambia). */
export function scaleLimits(limits: Limits, factor: number): Limits {
  if (factor === 1) return limits;
  return Object.fromEntries(
    Object.entries(limits).map(([name, options]) => [
      name,
      { ...options, limit: options.limit * factor },
    ]),
  ) as unknown as Limits;
}

/** Generosos a propósito: en ferias y eventos muchas personas comparten una misma red. */
export const DEFAULT_LIMITS: Limits = {
  register: { windowMs: 60 * 60_000, limit: 20 },
  login: { windowMs: 15 * 60_000, limit: 30 },
  refresh: { windowMs: 15 * 60_000, limit: 120 },
  changePassword: { windowMs: 15 * 60_000, limit: 10 },
  forgotPassword: { windowMs: 60 * 60_000, limit: 10 },
  resetPassword: { windowMs: 60 * 60_000, limit: 20 },
  contact: { windowMs: 60 * 60_000, limit: 5 },
  accessResolve: { windowMs: 15 * 60_000, limit: 60 },
  accessRedeem: { windowMs: 15 * 60_000, limit: 30 },
};
