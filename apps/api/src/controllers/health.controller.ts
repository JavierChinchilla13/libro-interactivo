import type { RequestHandler } from 'express';
import { getHealth } from '../services/health.service.js';

export function createHealthController(isDbUp: () => boolean): RequestHandler {
  return (_req, res) => {
    res.json(getHealth(isDbUp));
  };
}
