import { createApp } from './app.js';
import { EnvError, parseEnv, type Env } from './config/env.js';
import { connectDb, disconnectDb, isDbUp } from './db/connect.js';
import { createLogger } from './lib/logger.js';

function loadEnvOrExit(): Env {
  try {
    return parseEnv();
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      console.error('Revisa apps/api/.env.example y tus variables de entorno.');
      process.exit(1);
    }
    throw error;
  }
}

/** Solo nombre y mensaje: el error completo de la conexión puede incluir detalles del clúster. */
function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

const env = loadEnvOrExit();
const logger = createLogger(env);

try {
  await connectDb(env.MONGODB_URI);
  logger.info('Conectado a MongoDB');
} catch (error) {
  if (env.NODE_ENV === 'production') {
    logger.fatal({ reason: describeError(error) }, 'No se pudo conectar a MongoDB');
    process.exit(1);
  }
  logger.warn(
    { reason: describeError(error) },
    'MongoDB no disponible; el API arranca igual (en desarrollo). Ejecuta `npm run dev:db` en otra terminal.',
  );
}

const app = createApp({ env, logger, isDbUp });
const server = app.listen(env.PORT, () => {
  logger.info(`API escuchando en http://localhost:${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} recibido; cerrando…`);
  server.close();
  await disconnectDb().catch(() => undefined);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
