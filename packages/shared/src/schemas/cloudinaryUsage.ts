import { z } from 'zod';

/**
 * Uso de la cuenta de Cloudinary (solo ADMIN). Es una versión **normalizada** de lo que responde su API de administración
 * (`GET /usage`): nunca incluye claves, secretos ni el nombre de la cuenta. Los planes por créditos y los antiguos
 * devuelven formas distintas, así que todo campo es opcional: solo viaja lo que Cloudinary informó.
 *
 * Si la consulta falla (o Cloudinary no está configurado) llega `available: false` con una razón corta y el panel sigue
 * funcionando; no es un error del servidor.
 */
const amountSchema = z.object({
  used: z.number().nonnegative(),
  limit: z.number().positive(),
  /** 0–100 (puede pasar de 100 si la cuenta se excedió). Un decimal. */
  percent: z.number().nonnegative(),
});

const bytesSchema = z.object({
  bytes: z.number().nonnegative(),
  /** `null` cuando el plan no informa un tope (hoy el plan gratuito por créditos no lo informa). */
  limitBytes: z.number().positive().nullable(),
});

export const cloudinaryUsageSchema = z.object({
  /** `false`: no se pudo consultar; el panel solo muestra el enlace. */
  available: z.boolean(),
  /** Por qué no está disponible (texto corto, sin detalles internos). */
  reason: z.string().optional(),
  /** Nombre del plan tal como lo informa Cloudinary («Free», «Plus»…). */
  plan: z.string().optional(),
  /** Créditos del mes (planes por créditos). */
  credits: amountSchema.optional(),
  storage: bytesSchema.optional(),
  bandwidth: bytesSchema.optional(),
  /** Cuándo actualizó Cloudinary esas cifras (fecha que él informa), si la informa. */
  lastUpdated: z.string().optional(),
  /** Cuándo se hizo la consulta (ISO). */
  checkedAt: z.string(),
});
export type CloudinaryUsage = z.infer<typeof cloudinaryUsageSchema>;

/** Desde qué porcentaje de créditos el panel avisa y desde cuál alerta (siempre con texto, no solo color). */
export const USAGE_WARN_PERCENT = 80;
export const USAGE_ALERT_PERCENT = 95;

/** Enlace de Cloudinary para ver el uso o ampliar el plan (la consola; no se inventan rutas más profundas). */
export const CLOUDINARY_CONSOLE_URL = 'https://console.cloudinary.com/';
