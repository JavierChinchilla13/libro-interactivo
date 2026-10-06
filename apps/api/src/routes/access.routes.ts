import {
  accessTokenListQuerySchema,
  accessTokenParamSchema,
  accessTokenParamsSchema,
  createAccessTokenRequestSchema,
  extraInputSchema,
  extraListQuerySchema,
  extraParamsSchema,
  extraUploadUrlRequestSchema,
  readerExtrasQuerySchema,
  redeemAccessRequestSchema,
  revokeAccessTokenRequestSchema,
} from '@libro/shared';
import { Router } from 'express';
import type { Limits } from '../config/limits.js';
import type {
  createAccessController,
  createAdminAccessController,
  createAdminExtraController,
  createReaderExtraController,
} from '../controllers/access.controller.js';
import type { Guards } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';

/** `/access`: resolver (público, mínimo) y canjear (con sesión) un código QR. Ambos con límite por IP. */
export function createAccessRouter(
  controller: ReturnType<typeof createAccessController>,
  guards: Guards,
  limits: Limits,
): Router {
  const router = Router();
  router.get(
    '/resolve/:token',
    createRateLimiter(limits.accessResolve),
    validate({ params: accessTokenParamSchema }),
    controller.resolve,
  );
  router.post(
    '/redeem',
    guards.requireAuth,
    createRateLimiter(limits.accessRedeem),
    validate({ body: redeemAccessRequestSchema }),
    controller.redeem,
  );
  return router;
}

/** `/admin/access-tokens`: SOLO administradoras (las editoras gestionan contenido, no los códigos de acceso). */
export function createAdminAccessRouter(
  controller: ReturnType<typeof createAdminAccessController>,
  guards: Guards,
): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('ADMIN'));
  const params = validate({ params: accessTokenParamsSchema });
  router.get('/', validate({ query: accessTokenListQuerySchema }), controller.list);
  router.post('/', validate({ body: createAccessTokenRequestSchema }), controller.create);
  router.post(
    '/:tokenId/revoke',
    validate({ params: accessTokenParamsSchema, body: revokeAccessTokenRequestSchema }),
    controller.revoke,
  );
  router.post('/:tokenId/rotate', params, controller.rotate);
  router.get('/:tokenId/qr.svg', params, controller.svg);
  router.get('/:tokenId/qr.pdf', params, controller.pdf);
  return router;
}

/** `/admin/extras`: EDITOR o ADMIN. */
export function createAdminExtraRouter(
  controller: ReturnType<typeof createAdminExtraController>,
  guards: Guards,
): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('EDITOR', 'ADMIN'));
  const params = validate({ params: extraParamsSchema });
  router.get('/', validate({ query: extraListQuerySchema }), controller.list);
  router.post('/', validate({ body: extraInputSchema }), controller.create);
  // `/upload-url` antes de `/:extraId` para que no se tome como un id.
  router.post('/upload-url', validate({ body: extraUploadUrlRequestSchema }), controller.uploadUrl);
  router.get('/:extraId', params, controller.get);
  router.put(
    '/:extraId',
    validate({ params: extraParamsSchema, body: extraInputSchema }),
    controller.replace,
  );
  router.get('/:extraId/preview', params, controller.preview);
  return router;
}

/** `/extras`: lectura de los extras de un libro. Bloqueados hasta completar el libro; el servidor decide cada vez. */
export function createReaderExtraRouter(
  controller: ReturnType<typeof createReaderExtraController>,
  guards: Guards,
): Router {
  const router = Router();
  router.use(guards.requireAuth);
  router.get('/', validate({ query: readerExtrasQuerySchema }), controller.list);
  router.get('/:extraId', validate({ params: extraParamsSchema }), controller.open);
  return router;
}
