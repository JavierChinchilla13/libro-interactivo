import type { Express } from 'express';
import { createApp, type AppContext } from '../app.js';
import { parseEnv, type Env } from '../config/env.js';
import type { Clock } from '../lib/clock.js';
import { createLogger } from '../lib/logger.js';
import type { AuthLimits } from '../routes/auth.routes.js';

/** Límites muy altos para que las pruebas de auth no choquen entre sí (las de rate limit pasan los suyos). */
const RELAXED_LIMITS: AuthLimits = {
  register: { windowMs: 60_000, limit: 10_000 },
  login: { windowMs: 60_000, limit: 10_000 },
  refresh: { windowMs: 60_000, limit: 10_000 },
};

interface TestAppOptions {
  dbUp?: boolean;
  clock?: Clock;
  limits?: Partial<AuthLimits>;
  env?: Partial<Record<keyof Env, string>>;
  configure?: (app: Express, ctx: AppContext) => void;
}

/** App de pruebas: entorno `test`, logger silencioso y estado de BD controlable. */
export function createTestApp(options: TestAppOptions = {}) {
  const env = parseEnv({ NODE_ENV: 'test', ...options.env });
  return createApp(
    {
      env,
      logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      isDbUp: () => options.dbUp ?? true,
      ...(options.clock ? { clock: options.clock } : {}),
      limits: { ...RELAXED_LIMITS, ...options.limits },
    },
    options.configure,
  );
}

/** Reloj de pruebas que se puede adelantar. */
export function createTestClock(start = new Date()) {
  let current = start.getTime();
  const clock: Clock & { advance: (ms: number) => void } = Object.assign(() => new Date(current), {
    advance: (ms: number) => {
      current += ms;
    },
  });
  return clock;
}
