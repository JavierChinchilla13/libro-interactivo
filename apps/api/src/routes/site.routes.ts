import { publicBookParamsSchema, updateSiteSettingsRequestSchema } from '@libro/shared';
import { Router } from 'express';
import type {
  createAdminSiteController,
  createPublicBookController,
  createPublicSiteController,
  createWelcomeController,
} from '../controllers/site.controller.js';
import type { Guards } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/** `/books`: libros visibles para todo el mundo (publicados y «próximamente»). */
export function createPublicBookRouter(
  controller: ReturnType<typeof createPublicBookController>,
): Router {
  const router = Router();
  router.get('/', controller.list);
  router.get('/:slug', validate({ params: publicBookParamsSchema }), controller.get);
  return router;
}

/** `/site`: ajustes públicos de la landing. */
export function createPublicSiteRouter(
  controller: ReturnType<typeof createPublicSiteController>,
): Router {
  const router = Router();
  router.get('/', controller.get);
  return router;
}

/** `/me/welcome` y `/me/welcome-seen`: el mensaje de bienvenida del lector (el servidor decide si toca mostrarlo). */
export function createWelcomeRouter(
  controller: ReturnType<typeof createWelcomeController>,
  guards: Guards,
): Router {
  const router = Router();
  router.use(guards.requireAuth);
  router.get('/welcome', controller.get);
  router.post('/welcome-seen', controller.seen);
  return router;
}

/** `/admin/site-settings`: editoras y administradoras editan la bienvenida, la presentación, la autora, las redes y el texto de «bloqueado». */
export function createAdminSiteRouter(
  controller: ReturnType<typeof createAdminSiteController>,
  guards: Guards,
): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('EDITOR', 'ADMIN'));
  router.get('/', controller.get);
  router.patch('/', validate({ body: updateSiteSettingsRequestSchema }), controller.update);
  return router;
}
