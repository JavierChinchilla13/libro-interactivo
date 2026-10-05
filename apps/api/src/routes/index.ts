import { Router } from 'express';
import type { Env } from '../config/env.js';
import type { AuthService } from '../services/auth.service.js';
import { createAuthRouter, type AuthLimits } from './auth.routes.js';
import { createHealthRouter } from './health.routes.js';

export interface RouteDeps {
  env: Pick<Env, 'NODE_ENV' | 'COOKIE_DOMAIN'>;
  isDbUp: () => boolean;
  auth: AuthService;
  limits: AuthLimits;
}

/** Router raíz de `/api`. Cada módulo (auth, quizzes, …) monta aquí su propio router. */
export function createApiRouter(deps: RouteDeps): Router {
  const router = Router();
  router.use('/health', createHealthRouter(deps.isDbUp));
  router.use('/auth', createAuthRouter(deps.auth, deps.env, deps.limits));
  return router;
}
