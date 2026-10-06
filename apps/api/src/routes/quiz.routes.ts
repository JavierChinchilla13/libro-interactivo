import {
  attemptStageParamsSchema,
  progressQuerySchema,
  quizParamsSchema,
  resultsListQuerySchema,
  submitAnswersRequestSchema,
} from '@libro/shared';
import { Router } from 'express';
import type { createAdminQuizEditorController } from '../controllers/admin.controller.js';
import type { createAdminQuizController, createQuizController } from '../controllers/quiz.controller.js';
import type { Guards } from '../middleware/auth.js';
import type { RequireUnlocked } from '../middleware/unlocked.js';
import { validate } from '../middleware/validate.js';
import { mountQuizEditorRoutes } from './admin.routes.js';

type QuizController = ReturnType<typeof createQuizController>;
type AdminQuizController = ReturnType<typeof createAdminQuizController>;

/** `/quizzes`: intro e inicio de intento. Exige sesión y que el quiz esté desbloqueado (403 sin contenido). */
export function createQuizRouter(
  controller: QuizController,
  guards: Guards,
  requireUnlocked: RequireUnlocked,
): Router {
  const router = Router();
  router.use(guards.requireAuth);
  const params = validate({ params: quizParamsSchema });
  router.get('/:quizId', params, requireUnlocked(), controller.getIntro);
  router.post('/:quizId/attempts', params, requireUnlocked(), controller.startAttempt);
  return router;
}

/** `/attempts`: respuestas de una etapa. El servicio vuelve a comprobar el acceso en cada petición. */
export function createAttemptRouter(controller: QuizController, guards: Guards): Router {
  const router = Router();
  router.use(guards.requireAuth);
  router.post(
    '/:attemptId/stages/:stageId/answers',
    validate({ params: attemptStageParamsSchema, body: submitAnswersRequestSchema }),
    controller.submitAnswers,
  );
  return router;
}

/** `/me/progress` y `/me/results`: avance y resultados de la persona autenticada. */
export function createLearningRouter(controller: QuizController, guards: Guards): Router {
  const router = Router();
  router.use(guards.requireAuth);
  router.get('/progress', validate({ query: progressQuerySchema }), controller.getProgress);
  router.get('/results', validate({ query: resultsListQuerySchema }), controller.listResults);
  router.get('/results/:quizId', validate({ params: quizParamsSchema }), controller.getQuizResults);
  return router;
}

/** `/admin/quizzes`: editar el borrador, validar, publicar y probar (EDITOR o ADMIN). */
export function createAdminQuizRouter(
  controller: AdminQuizController,
  editor: ReturnType<typeof createAdminQuizEditorController>,
  guards: Guards,
): Router {
  const router = Router();
  router.use(guards.requireAuth, guards.requireRole('EDITOR', 'ADMIN'));
  const params = validate({ params: quizParamsSchema });
  router.post('/:quizId/validate', params, controller.validateQuiz);
  router.post('/:quizId/publish', params, controller.publish);
  router.post('/:quizId/preview', params, controller.preview);
  mountQuizEditorRoutes(router, editor);
  return router;
}
