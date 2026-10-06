import { loginRequestSchema, registerRequestSchema } from '@libro/shared';
import { Router } from 'express';
import type { Env } from '../config/env.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { createRateLimiter, type RateLimitOptions } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import type { AuthService } from '../services/auth.service.js';

export interface AuthLimits {
  register: RateLimitOptions;
  login: RateLimitOptions;
  refresh: RateLimitOptions;
}

/** Límites por IP. Generosos a propósito: en ferias y eventos muchas personas comparten una misma red. */
export const DEFAULT_AUTH_LIMITS: AuthLimits = {
  register: { windowMs: 60 * 60_000, limit: 20 },
  login: { windowMs: 15 * 60_000, limit: 30 },
  refresh: { windowMs: 15 * 60_000, limit: 120 },
};

export function createAuthRouter(
  auth: AuthService,
  env: Pick<Env, 'NODE_ENV' | 'COOKIE_DOMAIN'>,
  limits: AuthLimits,
): Router {
  const controller = createAuthController(auth, env);
  const router = Router();

  router.post(
    '/register',
    createRateLimiter(limits.register),
    validate({ body: registerRequestSchema }),
    controller.register,
  );
  router.post(
    '/login',
    createRateLimiter(limits.login),
    validate({ body: loginRequestSchema }),
    controller.login,
  );
  router.post('/refresh', createRateLimiter(limits.refresh), controller.refresh);
  router.post('/logout', controller.logout);

  return router;
}
