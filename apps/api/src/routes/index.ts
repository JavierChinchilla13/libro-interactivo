import { Router } from 'express';
import type { Env } from '../config/env.js';
import type { Limits } from '../config/limits.js';
import { createAccountController } from '../controllers/account.controller.js';
import { createQuizController, createAdminQuizController } from '../controllers/quiz.controller.js';
import type { Guards } from '../middleware/auth.js';
import type { RequireUnlocked } from '../middleware/unlocked.js';
import type { AccountService } from '../services/account.service.js';
import type { AuthService } from '../services/auth.service.js';
import type { ContactService } from '../services/contact.service.js';
import type { PasswordResetService } from '../services/passwordReset.service.js';
import type { ProgressService } from '../services/progress.service.js';
import type { QuizService } from '../services/quiz.service.js';
import type { QuizPublishService } from '../services/quizPublish.service.js';
import { createAccountRouter } from './account.routes.js';
import { createAuthRouter } from './auth.routes.js';
import { createContactRouter } from './contact.routes.js';
import { createHealthRouter } from './health.routes.js';
import {
  createAdminQuizRouter,
  createAttemptRouter,
  createLearningRouter,
  createQuizRouter,
} from './quiz.routes.js';

export interface RouteDeps {
  env: Pick<Env, 'NODE_ENV' | 'COOKIE_DOMAIN'>;
  isDbUp: () => boolean;
  auth: AuthService;
  account: AccountService;
  recovery: PasswordResetService;
  contact: ContactService;
  quizzes: QuizService;
  progress: ProgressService;
  quizPublisher: QuizPublishService;
  requireUnlocked: RequireUnlocked;
  guards: Guards;
  limits: Limits;
}

/** Router raíz de `/api`. Cada módulo (auth, quizzes, …) monta aquí su propio router. */
export function createApiRouter(deps: RouteDeps): Router {
  const accountController = createAccountController(deps.account, deps.env);
  const quizController = createQuizController(deps.quizzes, deps.progress);
  const router = Router();
  router.use('/health', createHealthRouter(deps.isDbUp));
  router.use(
    '/auth',
    createAuthRouter({
      auth: deps.auth,
      recovery: deps.recovery,
      account: accountController,
      guards: deps.guards,
      env: deps.env,
      limits: deps.limits,
    }),
  );
  router.use('/me', createAccountRouter(accountController, deps.guards));
  router.use('/me', createLearningRouter(quizController, deps.guards));
  router.use('/contact', createContactRouter(deps.contact, deps.limits));
  router.use('/quizzes', createQuizRouter(quizController, deps.guards, deps.requireUnlocked));
  router.use('/attempts', createAttemptRouter(quizController, deps.guards));
  router.use(
    '/admin/quizzes',
    createAdminQuizRouter(createAdminQuizController(deps.quizPublisher), deps.guards),
  );
  return router;
}
