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
  /** URL pública del sitio web; se usa para armar los enlaces de los correos (p. ej. restablecer contraseña). */
  APP_URL: z
    .url('debe ser una URL completa, p. ej. https://app.midominio.com')
    .transform((url) => url.replace(/\/+$/, '')),
  /** Cuánto dura el enlace de recuperación de contraseña. */
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  /** Proveedor de correo: `memory` (solo desarrollo/pruebas), `gmail` (SMTP) o `resend` (API HTTP). */
  MAIL_PROVIDER: z.enum(['memory', 'gmail', 'resend']),
  /** Remitente, p. ej. `Libro Interactivo <avisos@midominio.com>`. Obligatorio con Resend; con Gmail es la propia cuenta. */
  MAIL_FROM: z.string().min(3).optional(),
  GMAIL_USER: z.email('debe ser un correo de Gmail').optional(),
  /** Contraseña de aplicación de Google (16 caracteres; se aceptan con espacios). Nunca la contraseña normal. */
  GMAIL_APP_PASSWORD: z
    .string()
    .transform((value) => value.replace(/\s+/g, ''))
    .pipe(z.string().min(8))
    .optional(),
  RESEND_API_KEY: z.string().min(8).optional(),
  /** Cloudinary (subida firmada de imágenes y videos desde el panel). Las tres juntas o ninguna. */
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  /**
   * Exige haber canjeado el QR de un quiz para abrirlo (fase 8). Mientras no exista el canje va en `false`
   * y solo rigen los prerrequisitos de progresión.
   */
  REQUIRE_QR_UNLOCK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /** Correo de la autora donde llegan los mensajes de contacto (hasta que se configure en el panel). */
  CONTACT_RECIPIENT_EMAIL: z.email('debe ser un correo válido').optional(),
});

const envSchemaChecked = envSchema.superRefine((env, ctx) => {
  const need = (name: keyof typeof env, reason: string) => {
    if (env[name] === undefined) ctx.addIssue({ code: 'custom', path: [name], message: reason });
  };
  if (env.NODE_ENV === 'production' && env.MAIL_PROVIDER === 'memory') {
    ctx.addIssue({
      code: 'custom',
      path: ['MAIL_PROVIDER'],
      message: 'en producción debe ser gmail o resend (memory perdería todos los correos)',
    });
  }
  const cloudinary = [env.CLOUDINARY_CLOUD_NAME, env.CLOUDINARY_API_KEY, env.CLOUDINARY_API_SECRET];
  if (cloudinary.some((value) => value !== undefined) && cloudinary.some((value) => value === undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: ['CLOUDINARY_CLOUD_NAME'],
      message: 'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET van juntas o ninguna',
    });
  }
  if (env.MAIL_PROVIDER === 'gmail') {
    need('GMAIL_USER', 'es obligatoria con MAIL_PROVIDER=gmail');
    need('GMAIL_APP_PASSWORD', 'es obligatoria con MAIL_PROVIDER=gmail');
  }
  if (env.MAIL_PROVIDER === 'resend') {
    need('RESEND_API_KEY', 'es obligatoria con MAIL_PROVIDER=resend');
    need('MAIL_FROM', 'es obligatoria con MAIL_PROVIDER=resend (dominio verificado en Resend)');
  }
});

export type Env = z.infer<typeof envSchemaChecked>;

/** Valores que solo se asumen fuera de producción, para que `npm run dev` funcione sin configurar nada. */
const DEV_DEFAULTS: Record<string, string> = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/libro-interactivo',
  CORS_ORIGIN: 'http://localhost:5173',
  // Solo para desarrollo y pruebas: en producción JWT_ACCESS_SECRET es obligatoria.
  JWT_ACCESS_SECRET: 'solo-para-desarrollo-no-usar-en-produccion-0123456789',
  APP_URL: 'http://localhost:5173',
  MAIL_PROVIDER: 'memory',
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
  const result = envSchemaChecked.safeParse(input);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }
  return result.data;
}
