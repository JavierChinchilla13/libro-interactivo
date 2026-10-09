import {
  publicWikiEntriesQuerySchema,
  publicWikiEntryParamsSchema,
  publicWikiSectionsQuerySchema,
} from '@libro/shared';
import { Router } from 'express';
import type { createPublicWikiController } from '../controllers/publicWiki.controller.js';
import type { Guards } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/**
 * `/wiki`: la wiki del universo. Pública, pero lo que entrega depende de la sesión (opcional) y del progreso:
 * lo bloqueado responde `403 NOT_UNLOCKED` o llega como tarjeta bloqueada, sin contenido.
 */
export function createPublicWikiRouter(
  controller: ReturnType<typeof createPublicWikiController>,
  guards: Guards,
): Router {
  const router = Router();
  router.use(guards.optionalAuth);
  router.get('/sections', validate({ query: publicWikiSectionsQuerySchema }), controller.sections);
  router.get('/entries', validate({ query: publicWikiEntriesQuerySchema }), controller.entries);
  router.get(
    '/entries/:entryId',
    validate({ params: publicWikiEntryParamsSchema }),
    controller.entry,
  );
  return router;
}
