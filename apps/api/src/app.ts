import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import { systemClock, type Clock } from './lib/clock.js';
import type { Logger } from './lib/logger.js';
import { createGuards, type Guards } from './middleware/auth.js';
import { createErrorHandler, notFoundHandler } from './middleware/error.js';
import { createSameOriginGuard } from './middleware/sameOrigin.js';
import { DEFAULT_AUTH_LIMITS, type AuthLimits } from './routes/auth.routes.js';
import { createApiRouter } from './routes/index.js';
import { createAuthService, type AuthService } from './services/auth.service.js';
import { createTokenService } from './services/token.service.js';

export interface AppDeps {
  env: Pick<
    Env,
    | 'NODE_ENV'
    | 'CORS_ORIGIN'
    | 'JWT_ACCESS_SECRET'
    | 'ACCESS_TOKEN_TTL_SECONDS'
    | 'REFRESH_TOKEN_TTL_DAYS'
    | 'COOKIE_DOMAIN'
  >;
  logger: Logger;
  isDbUp: () => boolean;
  /** Reloj inyectable (pruebas de caducidad y bloqueos). Por defecto, la hora del sistema. */
  clock?: Clock;
  /** Límites de intentos por IP; por defecto `DEFAULT_AUTH_LIMITS`. */
  limits?: Partial<AuthLimits>;
}

/** Piezas compartidas que los módulos de rutas reutilizan (guards de sesión y rol, servicio de auth). */
export interface AppContext {
  guards: Guards;
  auth: AuthService;
}

/**
 * Construye la app Express sin escuchar en ningún puerto (así Supertest la prueba directamente).
 * `configure` permite montar rutas extra antes del 404 (se usa solo en pruebas).
 */
export function createApp(
  deps: AppDeps,
  configure?: (app: Express, ctx: AppContext) => void,
): Express {
  const clock = deps.clock ?? systemClock;
  const auth = createAuthService({
    tokens: createTokenService({
      secret: deps.env.JWT_ACCESS_SECRET,
      ttlSeconds: deps.env.ACCESS_TOKEN_TTL_SECONDS,
      clock,
    }),
    clock,
    ipSecret: deps.env.JWT_ACCESS_SECRET,
    refreshTtlDays: deps.env.REFRESH_TOKEN_TTL_DAYS,
  });
  const guards = createGuards(auth);

  const app = express();
  app.disable('x-powered-by');
  if (deps.env.NODE_ENV === 'production') app.set('trust proxy', 1); // Render está detrás de un proxy

  app.use(
    pinoHttp({
      logger: deps.logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: deps.env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', createSameOriginGuard(deps.env.CORS_ORIGIN));

  app.use(
    '/api',
    createApiRouter({
      env: deps.env,
      isDbUp: deps.isDbUp,
      auth,
      limits: { ...DEFAULT_AUTH_LIMITS, ...deps.limits },
    }),
  );
  configure?.(app, { guards, auth });

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
