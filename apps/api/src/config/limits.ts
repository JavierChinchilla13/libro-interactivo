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
  /** Informes de la política de contenido que mandan los navegadores (sin sesión; pueden venir varios por visita). */
  cspReport: RateLimitOptions;
  /** Guardar o revertir la apariencia de un quiz (por usuaria). */
  appearanceWrite: RateLimitOptions;
  /** Firmar subidas a Cloudinary (por usuaria y propósito). */
  uploadSign: RateLimitOptions;
  /** Firmar subidas de imágenes de cartas (por usuaria): una firma por imagen, hasta 12 por carta. */
  cardUploadSign: RateLimitOptions;
  /** Firmar subidas de fondos de quiz (`quiz-bg`, videos de hasta 5 MB): tope más bajo. */
  uploadSignQuizBg: RateLimitOptions;
  /** Descargar un respaldo desde el panel (por usuaria): por hora… */
  backupHour: RateLimitOptions;
  /** …y por día. */
  backupDay: RateLimitOptions;
  /** Apuntarse o darse de baja desde la cuenta (por usuaria; cada alta sin correo comprobado manda un correo). */
  newsletterAccount: RateLimitOptions;
  /** Confirmar el alta y darse de baja con el enlace del correo (sin sesión, por IP). */
  newsletterPublic: RateLimitOptions;
  /** Webhook de Resend (sin sesión, por IP). */
  webhook: RateLimitOptions;
  /** Pedir un aviso por correo (por usuaria). */
  notificationCreate: RateLimitOptions;
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
  cspReport: { windowMs: 10 * 60_000, limit: 200 },
  appearanceWrite: { windowMs: 15 * 60_000, limit: 60, by: 'user' },
  uploadSign: { windowMs: 60 * 60_000, limit: 60, by: 'user' },
  uploadSignQuizBg: { windowMs: 60 * 60_000, limit: 20, by: 'user' },
  cardUploadSign: { windowMs: 60 * 60_000, limit: 240, by: 'user' },
  backupHour: { windowMs: 60 * 60_000, limit: 3, by: 'user' },
  backupDay: { windowMs: 24 * 60 * 60_000, limit: 10, by: 'user' },
  newsletterAccount: { windowMs: 60 * 60_000, limit: 10, by: 'user' },
  newsletterPublic: { windowMs: 15 * 60_000, limit: 60 },
  webhook: { windowMs: 10 * 60_000, limit: 300 },
  notificationCreate: { windowMs: 60 * 60_000, limit: 30, by: 'user' },
};
