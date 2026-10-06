import { updateProfileRequestSchema } from '@libro/shared';
import { Router } from 'express';
import type { AccountController } from '../controllers/types.js';
import type { Guards } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

/** `/me`: perfil del usuario autenticado. En la v1 solo se puede editar el nombre. */
export function createAccountRouter(account: AccountController, guards: Guards): Router {
  const router = Router();
  router.use(guards.requireAuth);
  router.get('/', account.getMe);
  router.patch('/', validate({ body: updateProfileRequestSchema }), account.updateMe);
  return router;
}
