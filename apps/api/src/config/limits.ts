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
  /** Guardar o revertir la apariencia de un quiz (por usuaria). */
  appearanceWrite: RateLimitOptions;
  /** Firmar subidas a Cloudinary (por usuaria y propósito). */
  uploadSign: RateLimitOptions;
  /** Firmar subidas de fondos de quiz (`quiz-bg`, videos de hasta 5 MB): tope más bajo. */
  uploadSignQuizBg: RateLimitOptions;
}

/**
 * Factor que se aplica a los límites. `RATE_LIMIT_MULTIPLIER` es solo para pruebas de extremo a extremo: en
 * producción se ignora siempre (un valor puesto por error no puede aflojar los límites de ingreso).
 */
export function limitFactor(env: {
  NODE_ENV: string;
  RATE_LIMIT_MULTIPLIER?: number | undefined;
}): number {
  return env.NODE_ENV === 'production' ? 1 : (env.RATE_LIMIT_MULTIPLIER ?? 1);
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
  appearanceWrite: { windowMs: 15 * 60_000, limit: 60, by: 'user' },
  uploadSign: { windowMs: 60 * 60_000, limit: 60, by: 'user' },
  uploadSignQuizBg: { windowMs: 60 * 60_000, limit: 20, by: 'user' },
};
