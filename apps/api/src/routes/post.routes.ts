import {
  adminPostListQuerySchema,
  adminPostParamsSchema,
  postInputSchema,
  postListQuerySchema,
  postSlugParamsSchema,
} from '@libro/shared';
import { Router } from 'express';
import type {
  createAdminPostController,
  createPublicPostController,
} from '../controllers/post.controller.js';
import type { Guards } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/** `/posts`: lista (con filtro por tipo, destacadas y paginación) y detalle por slug. Público. */
export function createPublicPostRouter(
  controller: ReturnType<typeof createPublicPostController>,
): Router {
  const router = Router();
  router.get('/', validate({ query: postListQuerySchema }), controller.list);
  router.get('/:slug', validate({ params: postSlugParamsSchema }), controller.get);
  return router;
}

/** `/admin/posts`: CRUD de actualizaciones (se archivan con `status: 'archived'`, no se borran). EDITOR o ADMIN. */
export function createAdminPostRouter(
  controller: ReturnType<typeof createAdminPostController>,
  guards: Guards,
): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('EDITOR', 'ADMIN'));
  router.get('/', validate({ query: adminPostListQuerySchema }), controller.list);
  router.post('/', validate({ body: postInputSchema }), controller.create);
  router.get('/:postId', validate({ params: adminPostParamsSchema }), controller.get);
  router.put(
    '/:postId',
    validate({ params: adminPostParamsSchema, body: postInputSchema }),
    controller.replace,
  );
  return router;
}
