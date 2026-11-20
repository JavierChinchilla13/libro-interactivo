import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/auth.js';
import type { TestProgressService } from '../services/testProgress.service.js';

export function createTestProgressController(service: TestProgressService) {
  const reset: RequestHandler = async (_req, res) => {
    res.set('Cache-Control', 'private, no-store').json(await service.reset(getAuth(res)));
  };
  return { reset };
}
