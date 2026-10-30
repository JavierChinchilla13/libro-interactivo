import { cspReportBodySchema, type CspReportBody } from '@libro/shared';
import express, { Router, type RequestHandler } from 'express';
import type { Limits } from '../config/limits.js';
import type { Logger } from '../lib/logger.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { getInput, validate } from '../middleware/validate.js';
import { extractViolations } from '../services/cspReport.service.js';

/**
 * `POST /api/csp-report`: recibe los informes de la política de contenido, que hoy va en modo SOLO REPORTE (no bloquea
 * nada). Los navegadores los mandan sin sesión y con tipos de contenido propios, por eso lleva su propio lector de JSON
 * (máximo 8 KB). Solo registra la directiva y el recurso bloqueado (sin IP, sin la página y sin parámetros) y responde
 * 204. No escribe en la base de datos.
 */
export function createCspReportRouter(logger: Logger, limits: Limits): Router {
  const router = Router();
  const reader = express.json({
    limit: '8kb',
    type: ['application/csp-report', 'application/reports+json', 'application/json'],
  });
  const handle: RequestHandler = (_req, res) => {
    const { body } = getInput<CspReportBody>(res);
    for (const violation of extractViolations(body)) {
      logger.info(
        { blocked: violation.blocked, directive: violation.directive },
        'Violación de la política de contenido (solo reporte)',
      );
    }
    res.status(204).end();
  };
  router.post(
    '/',
    createRateLimiter(limits.cspReport),
    reader,
    validate({ body: cspReportBodySchema }),
    handle,
  );
  return router;
}
