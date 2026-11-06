import {
  createBackupRequestSchema,
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
  createAdminNetworkController,
  createAdminUsersController,
} from '../controllers/adminOps.controller.js';
import type { createAdminBackupController } from '../controllers/adminBackup.controller.js';
import type { Limits } from '../config/limits.js';
import type { Guards } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
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

/** `/admin/network-check`: diagnóstico de la cadena de proxies (para elegir `TRUST_PROXY_HOPS`). Solo administradoras. */
export function createAdminNetworkRouter(
  controller: ReturnType<typeof createAdminNetworkController>,
  guards: Guards,
): Router {
  const router = adminOnly(guards);
  router.get('/', controller.check);
  return router;
}

/**
 * `/admin/backups`: estado y descarga del respaldo. La descarga es `POST` (la contraseña va en el cuerpo, nunca en la
 * URL). Primero se valida el cuerpo (un formulario mal llenado no gasta cupo) y después cuentan los límites por hora y
 * por día de la usuaria: una contraseña incorrecta sí gasta cupo.
 */
export function createAdminBackupRouter(
  controller: ReturnType<typeof createAdminBackupController>,
  guards: Guards,
  limits: Limits,
): Router {
  const router = adminOnly(guards);
  const message = 'Ya se descargaron varios respaldos hace poco. Inténtalo de nuevo más tarde.';
  router.get('/', controller.status);
  router.post(
    '/',
    validate({ body: createBackupRequestSchema }),
    createRateLimiter({ ...limits.backupHour, message }),
    createRateLimiter({ ...limits.backupDay, message }),
    controller.download,
  );
  return router;
}
