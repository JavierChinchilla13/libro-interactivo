import type { RequestHandler, Router } from 'express';
import type { createLifecycleHandlers } from '../controllers/lifecycle.js';
import type { Guards } from '../middleware/auth.js';

/**
 * Archivar y restaurar (con el mismo permiso que editar el contenido, el del propio router) y eliminar definitivamente
 * (**solo ADMIN**, además). `path` es la ruta con el id (`/:postId`); `params` valida ese id con Zod.
 */
export function mountLifecycle(
  router: Router,
  options: {
    path: string;
    params: RequestHandler;
    handlers: ReturnType<typeof createLifecycleHandlers>;
    guards: Guards;
  },
): void {
  const { path, params, handlers, guards } = options;
  router.post(`${path}/archive`, params, handlers.archive);
  router.post(`${path}/restore`, params, handlers.restore);
  router.delete(path, guards.requireRole('ADMIN'), params, handlers.remove);
}
