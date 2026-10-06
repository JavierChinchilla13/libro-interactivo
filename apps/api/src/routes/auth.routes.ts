import {
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
} from '@libro/shared';
import { Router } from 'express';
import type { Env } from '../config/env.js';
import type { Limits } from '../config/limits.js';
import type { AccountController } from '../controllers/types.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { createRecoveryController } from '../controllers/recovery.controller.js';
import type { Guards } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import type { AuthService } from '../services/auth.service.js';
import type { PasswordResetService } from '../services/passwordReset.service.js';

export interface AuthRouterDeps {
  auth: AuthService;
  recovery: PasswordResetService;
  account: AccountController;
  guards: Guards;
  env: Pick<Env, 'NODE_ENV' | 'COOKIE_DOMAIN'>;
  limits: Limits;
}

export function createAuthRouter({
  auth,
  recovery,
  account,
  guards,
  env,
  limits,
}: AuthRouterDeps): Router {
  const controller = createAuthController(auth, env);
  const recoveryController = createRecoveryController(recovery);
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

  router.post(
    '/change-password',
    createRateLimiter(limits.changePassword),
    guards.requireAuth,
    validate({ body: changePasswordRequestSchema }),
    account.changePassword,
  );
  router.post(
    '/forgot-password',
    createRateLimiter(limits.forgotPassword),
    validate({ body: forgotPasswordRequestSchema }),
    recoveryController.forgotPassword,
  );
  router.post(
    '/reset-password',
    createRateLimiter(limits.resetPassword),
    validate({ body: resetPasswordRequestSchema }),
    recoveryController.resetPassword,
  );

  return router;
}
