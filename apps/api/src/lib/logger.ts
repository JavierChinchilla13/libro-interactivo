import { pino, type Logger } from 'pino';
import type { Env } from '../config/env.js';

export type { Logger };

/**
 * Lo que nunca llega a los registros: contraseñas, tokens, cookies y la dirección IP del lector (ni en las cabeceras
 * que la traen ni en la conexión). La política de privacidad dice que los registros del servidor no guardan la IP.
 */
export const LOG_REDACTION = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    'req.headers["x-forwarded-for"]',
    'req.headers["cf-connecting-ip"]',
    'req.headers["x-real-ip"]',
    'req.headers["true-client-ip"]',
    'req.headers.forwarded',
    'req.remoteAddress',
    'req.remotePort',
    '*.password',
    '*.archivePassword',
    '*.archivePasswordConfirm',
    '*.passwordHash',
    '*.token',
  ],
  censor: '[REDACTADO]',
};

/** Logger JSON; nunca registra contraseñas, tokens, cookies ni IP (ver `LOG_REDACTION`). */
export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Logger {
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    redact: LOG_REDACTION,
    ...(env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  });
}
