import { testProgressResetBodySchema, testProgressResetQuerySchema } from '@libro/shared';
import { Router } from 'express';
import type { createTestProgressController } from '../controllers/testProgress.controller.js';
import type { Guards } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/**
 * `/me/test-progress`: «Reiniciar mi progreso de prueba». Solo EDITOR o ADMIN. Ni la consulta ni el cuerpo aceptan nada
 * (un `userId` o cualquier otro dato da 400): se borra siempre y solo lo de prueba de la cuenta de la sesión.
 */
export function createTestProgressRouter(
  controller: ReturnType<typeof createTestProgressController>,
  guards: Guards,
): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('EDITOR', 'ADMIN'));
  router.delete(
    '/',
    validate({ query: testProgressResetQuerySchema, body: testProgressResetBodySchema }),
    controller.reset,
  );
  return router;
}
