import { Router } from 'express';
import { createHealthRouter } from './health.routes.js';

export interface RouteDeps {
  isDbUp: () => boolean;
}

/** Router raíz de `/api`. Cada módulo (auth, quizzes, …) monta aquí su propio router. */
export function createApiRouter(deps: RouteDeps): Router {
  const router = Router();
  router.use('/health', createHealthRouter(deps.isDbUp));
  return router;
}
