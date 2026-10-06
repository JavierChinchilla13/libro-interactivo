import type { RequestHandler } from 'express';
import { getInput } from './validate.js';
import { getAuth } from './auth.js';
import type { ProgressService } from '../services/progress.service.js';

/**
 * `requireUnlocked`: la persona puede abrir el quiz de la ruta (prerrequisitos de progresión y, desde la fase 8,
 * QR canjeado). Si no, responde 403 `NOT_UNLOCKED` sin contenido. Va después de `requireAuth` y de `validate`
 * (los params ya llegan como ObjectId válido). EDITOR y ADMIN pasan siempre (juegan en modo prueba).
 */
export function createRequireUnlocked(progress: ProgressService) {
  return (): RequestHandler => async (_req, res, next) => {
    const { params } = getInput<unknown, unknown, { quizId: string }>(res);
    await progress.assertQuizAccess(getAuth(res), params.quizId);
    next();
  };
}

export type RequireUnlocked = ReturnType<typeof createRequireUnlocked>;
