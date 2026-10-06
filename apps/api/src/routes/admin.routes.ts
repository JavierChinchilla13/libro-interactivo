import {
  bookInputSchema,
  bookParamsSchema,
  createQuizRequestSchema,
  imageSignatureRequestSchema,
  quizDraftSchema,
  quizListQuerySchema,
  quizParamsSchema,
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
import type { Guards } from '../middleware/auth.js';
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
): void {
  const params = validate({ params: quizParamsSchema });
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
): Router {
  const router = staffRouter(guards);
  router.post('/image-signature', validate({ body: imageSignatureRequestSchema }), controller.sign);
  return router;
}
