import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '@libro/shared';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND', 'Recurso no encontrado'));
};

function isBodyParseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof error.type === 'string' &&
    error.type.startsWith('entity.')
  );
}

/** Manejador único de errores: nunca expone detalles internos ni trazas al cliente. */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    let status = 500;
    let body: ApiError = { error: { code: 'INTERNAL', message: 'Error interno del servidor' } };

    if (error instanceof AppError) {
      status = error.status;
      body = { error: { code: error.code, message: error.message } };
    } else if (error instanceof ZodError) {
      status = 400;
      body = { error: { code: 'VALIDATION', message: 'Datos no válidos' } };
    } else if (isBodyParseError(error)) {
      status = 400;
      body = { error: { code: 'VALIDATION', message: 'El cuerpo de la petición no es válido' } };
    } else {
      logger.error({ err: error, method: req.method, url: req.url }, 'Error no controlado');
    }

    if (res.headersSent) return;
    res.status(status).json(body);
  };
}
