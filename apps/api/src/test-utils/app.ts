import type { Express } from 'express';
import { createApp, type AppContext } from '../app.js';
import { parseEnv, type Env } from '../config/env.js';
import type { Limits } from '../config/limits.js';
import { createBackgroundTasks } from '../lib/background.js';
import type { Clock } from '../lib/clock.js';
import { createLogger } from '../lib/logger.js';
import { MemoryMailProvider, type MailProvider } from '../providers/mail/MailProvider.js';
import type { ImageProvider } from '../providers/images/ImageProvider.js';
import {
  MemoryStorageProvider,
  type StorageProvider,
} from '../providers/storage/StorageProvider.js';
import type { RandomInt } from '../services/quiz-engine.js';

/** Límites muy altos para que las pruebas no choquen entre sí (las de rate limit pasan los suyos). */
const RELAXED_LIMITS: Limits = {
  register: { windowMs: 60_000, limit: 10_000 },
  login: { windowMs: 60_000, limit: 10_000 },
  refresh: { windowMs: 60_000, limit: 10_000 },
  changePassword: { windowMs: 60_000, limit: 10_000 },
  forgotPassword: { windowMs: 60_000, limit: 10_000 },
  resetPassword: { windowMs: 60_000, limit: 10_000 },
  contact: { windowMs: 60_000, limit: 10_000 },
  accessResolve: { windowMs: 60_000, limit: 10_000 },
  accessRedeem: { windowMs: 60_000, limit: 10_000 },
};

interface TestAppOptions {
  dbUp?: boolean;
  clock?: Clock;
  limits?: Partial<Limits>;
  env?: Partial<Record<keyof Env, string>>;
  /** Proveedor de correo; por defecto uno en memoria (accesible desde `createTestHarness().mail`). */
  mail?: MailProvider;
  /** Azar de quizzes (barajado y empates); por defecto `crypto`. Con semilla para pruebas estadísticas. */
  random?: RandomInt;
  images?: ImageProvider;
  /** Almacenamiento privado; por defecto uno en memoria (accesible desde `createTestHarness().storage`). */
  storage?: StorageProvider;
  configure?: (app: Express, ctx: AppContext) => void;
}

/**
 * App de pruebas con acceso a lo que normalmente es interno: el correo "enviado" y la espera de las
 * tareas en segundo plano (`await flush()` antes de revisar `mail.sent`).
 */
export function createTestHarness(options: TestAppOptions = {}) {
  const env = parseEnv({ NODE_ENV: 'test', ...options.env });
  const logger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  const memoryMail = new MemoryMailProvider();
  const memoryStorage = new MemoryStorageProvider();
  const tasks = createBackgroundTasks(logger);
  const app = createApp(
    {
      env,
      logger,
      isDbUp: () => options.dbUp ?? true,
      mail: options.mail ?? memoryMail,
      tasks,
      ...(options.clock ? { clock: options.clock } : {}),
      ...(options.random ? { random: options.random } : {}),
      ...(options.images ? { images: options.images } : {}),
      storage: options.storage ?? memoryStorage,
      limits: { ...RELAXED_LIMITS, ...options.limits },
    },
    options.configure,
  );
  return { app, mail: memoryMail, storage: memoryStorage, flush: () => tasks.idle() };
}

/** App de pruebas simple (cuando no hace falta revisar correos). */
export function createTestApp(options: TestAppOptions = {}) {
  return createTestHarness(options).app;
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
