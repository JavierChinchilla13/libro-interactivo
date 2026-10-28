import {
  bookInputSchema,
  bookParamsSchema,
  createQuizRequestSchema,
  imageSignatureRequestSchema,
  quizDraftSchema,
  quizListQuerySchema,
  quizParamsSchema,
  revertQuizAppearanceRequestSchema,
  updateQuizAppearanceRequestSchema,
  updateQuizMetaRequestSchema,
  wikiEntryInputSchema,
  wikiListQuerySchema,
  wikiParamsSchema,
  wikiReorderRequestSchema,
} from '@libro/shared';
import { Router } from 'express';
import type {
  createAdminBookController,
  createAdminQuizEditorController,
  createAdminUploadController,
  createAdminWikiController,
} from '../controllers/admin.controller.js';
import type { Request, RequestHandler } from 'express';
import type { Limits } from '../config/limits.js';
import type { Guards } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';

/** Todo `/admin/*` exige sesión y rol EDITOR o ADMIN (lista explícita: se valida en el servidor). */
function staffRouter(guards: Guards): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('EDITOR', 'ADMIN'));
  return router;
}

/** `/admin/books`: CRUD de libros (se archivan con `status: 'archived'`, no se borran). */
export function createAdminBookRouter(
  controller: ReturnType<typeof createAdminBookController>,
  guards: Guards,
): Router {
  const router = staffRouter(guards);
  router.get('/', controller.list);
  router.post('/', validate({ body: bookInputSchema }), controller.create);
  router.get('/:bookId', validate({ params: bookParamsSchema }), controller.get);
  router.put(
    '/:bookId',
    validate({ params: bookParamsSchema, body: bookInputSchema }),
    controller.replace,
  );
  return router;
}

/** Edición del borrador de quizzes. Validar/publicar/probar están en `quiz.routes.ts` (mismo prefijo). */
export function mountQuizEditorRoutes(
  router: Router,
  controller: ReturnType<typeof createAdminQuizEditorController>,
  limits: Limits,
): void {
  const params = validate({ params: quizParamsSchema });
  const appearanceLimit = createRateLimiter(limits.appearanceWrite);
  router.get('/', validate({ query: quizListQuerySchema }), controller.list);
  router.post('/', validate({ body: createQuizRequestSchema }), controller.create);
  router.get('/:quizId', params, controller.get);
  router.patch(
    '/:quizId',
    validate({ params: quizParamsSchema, body: updateQuizMetaRequestSchema }),
    controller.updateMeta,
  );
  router.put(
    '/:quizId/draft',
    validate({ params: quizParamsSchema, body: quizDraftSchema }),
    controller.saveDraft,
  );
  router.get('/:quizId/versions', params, controller.versions);
  router.post('/:quizId/archive', params, controller.archive);
  // Apariencia en vivo (regla 5, excepción acotada): no crea versión. Cualquier editora o administradora.
  router.get('/:quizId/appearance', params, controller.getAppearance);
  router.get('/:quizId/appearance/history', params, controller.appearanceHistory);
  router.put(
    '/:quizId/appearance',
    appearanceLimit,
    validate({ params: quizParamsSchema, body: updateQuizAppearanceRequestSchema }),
    controller.updateAppearance,
  );
  router.post(
    '/:quizId/appearance/revert',
    appearanceLimit,
    validate({ params: quizParamsSchema, body: revertQuizAppearanceRequestSchema }),
    controller.revertAppearance,
  );
}

/** `/admin/wiki`: CRUD de la wiki unificada + reordenar. */
export function createAdminWikiRouter(
  controller: ReturnType<typeof createAdminWikiController>,
  guards: Guards,
): Router {
  const router = staffRouter(guards);
  router.get('/', validate({ query: wikiListQuerySchema }), controller.list);
  router.post('/', validate({ body: wikiEntryInputSchema }), controller.create);
  // `/reorder` va antes de `/:entryId` para que no se confunda con un id.
  router.patch('/reorder', validate({ body: wikiReorderRequestSchema }), controller.reorder);
  router.get('/:entryId', validate({ params: wikiParamsSchema }), controller.get);
  router.put(
    '/:entryId',
    validate({ params: wikiParamsSchema, body: wikiEntryInputSchema }),
    controller.replace,
  );
  return router;
}

/** `/admin/uploads`: firma de subida directa a Cloudinary. */
export function createAdminUploadRouter(
  controller: ReturnType<typeof createAdminUploadController>,
  guards: Guards,
  limits: Limits,
): Router {
  const router = staffRouter(guards);
  // Cada propósito tiene su cupo por usuaria; los fondos de quiz (videos) tienen un tope más bajo.
  const purpose = (req: Request) =>
    String((req.body as { purpose?: unknown } | undefined)?.purpose);
  const general = createRateLimiter({ ...limits.uploadSign, keyPart: purpose });
  const quizBg = createRateLimiter({ ...limits.uploadSignQuizBg, keyPart: purpose });
  const byPurpose: RequestHandler = (req, res, next) =>
    purpose(req) === 'quiz-bg' ? quizBg(req, res, next) : general(req, res, next);
  router.post(
    '/image-signature',
    validate({ body: imageSignatureRequestSchema }),
    byPurpose,
    controller.sign,
  );
  return router;
}
