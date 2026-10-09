import {
  adminFanArtListQuerySchema,
  adminFanArtParamsSchema,
  adminReviewListQuerySchema,
  adminReviewParamsSchema,
  fanArtInputSchema,
  fanArtListQuerySchema,
  reviewInputSchema,
  reviewListQuerySchema,
} from '@libro/shared';
import { Router } from 'express';
import type {
  createAdminFanArtController,
  createAdminReviewController,
  createPublicCommunityController,
} from '../controllers/community.controller.js';
import type { Guards } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/** `/fan-arts`: público, solo lo publicado con el permiso del artista confirmado. */
export function createPublicFanArtRouter(
  controller: ReturnType<typeof createPublicCommunityController>,
): Router {
  const router = Router();
  router.get('/', validate({ query: fanArtListQuerySchema }), controller.listFanArts);
  return router;
}

/** `/reviews`: público, solo las reseñas publicadas. */
export function createPublicReviewRouter(
  controller: ReturnType<typeof createPublicCommunityController>,
): Router {
  const router = Router();
  router.get('/', validate({ query: reviewListQuerySchema }), controller.listReviews);
  return router;
}

function staffRouter(guards: Guards): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('EDITOR', 'ADMIN'));
  return router;
}

/** `/admin/fan-arts`: CRUD (se archivan con `status: 'archived'`, no se borran). EDITOR o ADMIN. */
export function createAdminFanArtRouter(
  controller: ReturnType<typeof createAdminFanArtController>,
  guards: Guards,
): Router {
  const router = staffRouter(guards);
  router.get('/', validate({ query: adminFanArtListQuerySchema }), controller.list);
  router.post('/', validate({ body: fanArtInputSchema }), controller.create);
  router.get('/:fanArtId', validate({ params: adminFanArtParamsSchema }), controller.get);
  router.put(
    '/:fanArtId',
    validate({ params: adminFanArtParamsSchema, body: fanArtInputSchema }),
    controller.replace,
  );
  return router;
}

/** `/admin/reviews`: CRUD (se ocultan con `status: 'hidden'`, no se borran). EDITOR o ADMIN. */
export function createAdminReviewRouter(
  controller: ReturnType<typeof createAdminReviewController>,
  guards: Guards,
): Router {
  const router = staffRouter(guards);
  router.get('/', validate({ query: adminReviewListQuerySchema }), controller.list);
  router.post('/', validate({ body: reviewInputSchema }), controller.create);
  router.get('/:reviewId', validate({ params: adminReviewParamsSchema }), controller.get);
  router.put(
    '/:reviewId',
    validate({ params: adminReviewParamsSchema, body: reviewInputSchema }),
    controller.replace,
  );
  return router;
}
