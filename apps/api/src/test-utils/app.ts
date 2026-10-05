import type { Express } from 'express';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

/** App de pruebas: entorno `test`, logger silencioso y estado de BD controlable. */
export function createTestApp(
  options: { dbUp?: boolean; configure?: (app: Express) => void } = {},
) {
  const env = parseEnv({ NODE_ENV: 'test' });
  return createApp(
    { env, logger: createLogger(env), isDbUp: () => options.dbUp ?? true },
    options.configure,
  );
}
