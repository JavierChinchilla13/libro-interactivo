import {
  confirmNewsletterRequestSchema,
  invitationAnswerRequestSchema,
  unsubscribeQuerySchema,
  updateNewsletterRequestSchema,
} from '@libro/shared';
import express, { Router } from 'express';
import type { Limits } from '../config/limits.js';
import type { createNewsletterController } from '../controllers/newsletter.controller.js';
import type { Guards } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';

type Controller = ReturnType<typeof createNewsletterController>;

/** `/me/newsletter`: la casilla de la cuenta (con sesión). */
export function createAccountNewsletterRouter(
  controller: Controller,
  guards: Guards,
  limits: Limits,
): Router {
  const router = Router();
  router.use(guards.requireAuth);
  router.get('/', controller.state);
  router.put(
    '/',
    validate({ body: updateNewsletterRequestSchema }),
    createRateLimiter(limits.newsletterAccount),
    controller.update,
  );
  // «No, gracias» a la invitación única del panel («Sí» usa el PUT de arriba).
  router.put(
    '/invitation',
    validate({ body: invitationAnswerRequestSchema }),
    createRateLimiter(limits.newsletterAccount),
    controller.declineInvitation,
  );
  return router;
}

/**
 * `/newsletter`: confirmar el alta y darse de baja, **sin sesión**. La baja no pasa por la protección de mismo origen
 * (el botón de baja del cliente de correo no viene del sitio): la protege el token firmado. Las dos llevan su propio
 * límite por IP.
 */
export function createPublicNewsletterRouter(controller: Controller, limits: Limits): Router {
  const router = Router();
  const limit = createRateLimiter(limits.newsletterPublic);
  router.post(
    '/confirm',
    limit,
    validate({ body: confirmNewsletterRequestSchema }),
    controller.confirm,
  );
  router.post(
    '/unsubscribe',
    limit,
    validate({ query: unsubscribeQuerySchema }),
    controller.unsubscribe,
  );
  return router;
}

/**
 * `/webhooks/resend`: avisos de Resend (rebotes y quejas). Lee el cuerpo **crudo** (hace falta para verificar la firma
 * Svix), máximo 64 KB, con su propio límite por IP.
 */
export function createWebhookRouter(controller: Controller, limits: Limits): Router {
  const router = Router();
  router.post(
    '/resend',
    createRateLimiter(limits.webhook),
    express.text({ type: '*/*', limit: '64kb' }),
    controller.resendWebhook,
  );
  return router;
}
