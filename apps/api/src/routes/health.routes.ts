import { Router } from 'express';
import { createHealthController } from '../controllers/health.controller.js';

export function createHealthRouter(isDbUp: () => boolean): Router {
  const router = Router();
  router.get('/', createHealthController(isDbUp));
  return router;
}
