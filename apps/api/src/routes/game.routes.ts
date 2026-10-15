import { gameChoiceRequestSchema, objectIdSchema } from '@libro/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { createGameController } from '../controllers/game.controller.js';
import type { Guards } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

type GameController = ReturnType<typeof createGameController>;

const bookParams = z.object({ bookId: objectIdSchema });
const sessionParams = z.object({ sessionId: objectIdSchema });

/**
 * `/game`: partidas del lector. El servicio comprueba en CADA petición sesión, desbloqueo y que la decisión sea de la
 * escena actual; el cliente solo manda el id de la decisión.
 */
export function createGameRouter(controller: GameController, guards: Guards): Router {
  const router = Router();
  router.use(guards.requireAuth);
  router.post('/:bookId/sessions', validate({ params: bookParams }), controller.start);
  router.get('/sessions/:sessionId', validate({ params: sessionParams }), controller.get);
  router.post(
    '/sessions/:sessionId/choices',
    validate({ params: sessionParams, body: gameChoiceRequestSchema }),
    controller.choose,
  );
  return router;
}

/** `/admin/game-stories` (solo ADMIN, solo lectura): la historia no se edita en el panel. */
export function createAdminGameRouter(controller: GameController, guards: Guards): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('ADMIN'));
  router.get('/', controller.listStories);
  return router;
}
