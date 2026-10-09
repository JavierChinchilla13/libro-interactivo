import {
  adminMessageListQuerySchema,
  adminMessageParamsSchema,
  adminUserListQuerySchema,
  adminUserParamsSchema,
  createStaffUserRequestSchema,
  updateMessageRequestSchema,
  updateUserRequestSchema,
} from '@libro/shared';
import { Router } from 'express';
import type {
  createAdminMetricsController,
  createAdminUsersController,
} from '../controllers/adminOps.controller.js';
import type { Guards } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/** Todo esto es solo de administradoras (lista explícita: las editoras no entran). */
function adminOnly(guards: Guards): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('ADMIN'));
  return router;
}

/** `/admin/users`: lista, detalle, crear editoras/administradoras, cambiar rol o estado y eliminar lectores. */
export function createAdminUsersRouter(
  controller: ReturnType<typeof createAdminUsersController>,
  guards: Guards,
): Router {
  const router = adminOnly(guards);
  router.get('/', validate({ query: adminUserListQuerySchema }), controller.list);
  router.post('/', validate({ body: createStaffUserRequestSchema }), controller.create);
  router.get('/:userId', validate({ params: adminUserParamsSchema }), controller.get);
  router.patch(
    '/:userId',
    validate({ params: adminUserParamsSchema, body: updateUserRequestSchema }),
    controller.update,
  );
  router.delete('/:userId', validate({ params: adminUserParamsSchema }), controller.remove);
  return router;
}

/** `/admin/contact-messages`: bandeja de mensajes (listar, marcar atendido, borrar). */
export function createAdminMessagesRouter(
  controller: ReturnType<typeof createAdminMetricsController>,
  guards: Guards,
): Router {
  const router = adminOnly(guards);
  router.get('/', validate({ query: adminMessageListQuerySchema }), controller.listMessages);
  router.patch(
    '/:messageId',
    validate({ params: adminMessageParamsSchema, body: updateMessageRequestSchema }),
    controller.updateMessage,
  );
  router.delete(
    '/:messageId',
    validate({ params: adminMessageParamsSchema }),
    controller.removeMessage,
  );
  return router;
}

/** `/admin/stats`: conteos básicos (sin intentos de prueba). */
export function createAdminStatsRouter(
  controller: ReturnType<typeof createAdminMetricsController>,
  guards: Guards,
): Router {
  const router = adminOnly(guards);
  router.get('/', controller.stats);
  return router;
}
