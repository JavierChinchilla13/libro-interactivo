import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defensa CSRF complementaria a `SameSite=Lax`: en métodos que modifican datos, si el navegador envía
 * `Origin`, debe ser uno de los orígenes permitidos. Sin cabecera `Origin` (clientes que no son
 * navegadores) la petición no puede aprovechar cookies de otra persona, así que se deja pasar.
 */
export function createSameOriginGuard(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins.map((origin) => origin.replace(/\/$/, '')));
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin && !allowed.has(origin.replace(/\/$/, ''))) {
      throw new AppError('FORBIDDEN', 'Origen no permitido');
    }
    next();
  };
}
