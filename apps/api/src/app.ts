import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import type { Logger } from './lib/logger.js';
import { createErrorHandler, notFoundHandler } from './middleware/error.js';
import { createApiRouter } from './routes/index.js';

export interface AppDeps {
  env: Pick<Env, 'NODE_ENV' | 'CORS_ORIGIN'>;
  logger: Logger;
  isDbUp: () => boolean;
}

/**
 * Construye la app Express sin escuchar en ningún puerto (así Supertest la prueba directamente).
 * `configure` permite montar rutas extra antes del 404 (se usa solo en pruebas).
 */
export function createApp(deps: AppDeps, configure?: (app: Express) => void): Express {
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

  app.use('/api', createApiRouter({ isDbUp: deps.isDbUp }));
  configure?.(app);

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
