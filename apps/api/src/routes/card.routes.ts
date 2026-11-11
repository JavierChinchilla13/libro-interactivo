import {
  cardInputSchema,
  cardListQuerySchema,
  cardParamsSchema,
  cardReorderRequestSchema,
  cardUploadSignatureRequestSchema,
} from '@libro/shared';
import { Router } from 'express';
import type { Limits } from '../config/limits.js';
import type {
  createAdminCardController,
  createReaderCardController,
} from '../controllers/card.controller.js';
import type { Guards } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';

/**
 * `/admin/cards`: SOLO administradoras (las cartas son secretos hasta que se abren con su QR: ni siquiera las editoras
 * ven su lista). La firma de subida comparte el cupo de las demás subidas a Cloudinary.
 */
export function createAdminCardRouter(
  controller: ReturnType<typeof createAdminCardController>,
  guards: Guards,
  limits: Limits,
): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('ADMIN'));
  const params = validate({ params: cardParamsSchema });
  router.get('/', validate({ query: cardListQuerySchema }), controller.list);
  router.post('/', validate({ body: cardInputSchema }), controller.create);
  // Rutas fijas antes de `/:cardId` para que no se tomen como un id.
  router.patch('/reorder', validate({ body: cardReorderRequestSchema }), controller.reorder);
  router.post(
    '/upload-signature',
    createRateLimiter({ ...limits.uploadSign, keyPart: () => 'cartas' }),
    validate({ body: cardUploadSignatureRequestSchema }),
    controller.uploadSignature,
  );
  router.get('/:cardId', params, controller.get);
  router.put(
    '/:cardId',
    validate({ params: cardParamsSchema, body: cardInputSchema }),
    controller.replace,
  );
  return router;
}

/** `/cards`: las cartas abiertas de la lectora. Sesión obligatoria; el servidor decide cada vez. */
export function createReaderCardRouter(
  controller: ReturnType<typeof createReaderCardController>,
  guards: Guards,
): Router {
  const router = Router();
  router.use(guards.requireAuth);
  router.get('/', controller.list);
  router.get('/:cardId', validate({ params: cardParamsSchema }), controller.open);
  return router;
}
