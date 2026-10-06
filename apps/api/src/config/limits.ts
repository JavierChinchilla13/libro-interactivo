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
};
