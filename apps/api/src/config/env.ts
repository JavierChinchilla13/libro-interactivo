import { z } from 'zod';

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z
    .string()
    .min(1)
    .regex(/^mongodb(\+srv)?:\/\//, 'debe empezar por mongodb:// o mongodb+srv://'),
  /** Orígenes permitidos para CORS, separados por coma (p. ej. https://app.midominio.com). */
  CORS_ORIGIN: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url('cada origen debe ser una URL completa')).min(1)),
  LOG_LEVEL: z.enum(logLevels).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/** Valores que solo se asumen fuera de producción, para que `npm run dev` funcione sin configurar nada. */
const DEV_DEFAULTS: Record<string, string> = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/libro-interactivo',
  CORS_ORIGIN: 'http://localhost:5173',
};

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Configuración de entorno no válida:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

function definedOnly(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => {
      const value = entry[1];
      return value !== undefined && value !== '';
    }),
  );
}

/** Lee y valida las variables de entorno. Lanza `EnvError` con un mensaje claro si algo falta o es inválido. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const provided = definedOnly(source);
  const isProduction = provided['NODE_ENV'] === 'production';
  const input = isProduction ? provided : { ...DEV_DEFAULTS, ...provided };
  const result = envSchema.safeParse(input);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }
  return result.data;
}
