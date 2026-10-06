import { contactRequestSchema } from '@libro/shared';
import { Router } from 'express';
import type { Limits } from '../config/limits.js';
import { createContactController } from '../controllers/contact.controller.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import type { ContactService } from '../services/contact.service.js';

export function createContactRouter(contact: ContactService, limits: Limits): Router {
  const controller = createContactController(contact);
  const router = Router();
  router.post(
    '/',
    createRateLimiter(limits.contact),
    validate({ body: contactRequestSchema }),
    controller.submit,
  );
  return router;
}
