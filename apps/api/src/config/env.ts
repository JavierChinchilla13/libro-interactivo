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
  /** Clave para firmar los access tokens (JWT). En producción: aleatoria, ≥ 32 caracteres, solo en Render. */
  JWT_ACCESS_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  /** Dominio de las cookies de sesión (opcional; p. ej. .midominio.com si web y API están en subdominios). */
  COOKIE_DOMAIN: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Valores que solo se asumen fuera de producción, para que `npm run dev` funcione sin configurar nada. */
const DEV_DEFAULTS: Record<string, string> = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/libro-interactivo',
  CORS_ORIGIN: 'http://localhost:5173',
  // Solo para desarrollo y pruebas: en producción JWT_ACCESS_SECRET es obligatoria.
  JWT_ACCESS_SECRET: 'solo-para-desarrollo-no-usar-en-produccion-0123456789',
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
