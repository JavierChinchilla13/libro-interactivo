import { z } from 'zod';
import { emailSchema } from './auth.js';

export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 5000;
/** Tiempo mínimo que debe pasar entre mostrar el formulario y enviarlo (frena bots rápidos). */
export const CONTACT_MIN_FILL_MS = 3000;

/**
 * Formulario de contacto de la landing.
 * - `website` es un campo trampa (honeypot): oculto para personas, los bots suelen llenarlo.
 * - `startedAt` es la hora (ms desde 1970) en que se mostró el formulario.
 */
export const contactRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Escribe tu nombre')
    .max(80, 'El nombre no puede superar los 80 caracteres'),
  email: emailSchema,
  message: z
    .string()
    .trim()
    .min(CONTACT_MESSAGE_MIN, `El mensaje debe tener al menos ${CONTACT_MESSAGE_MIN} caracteres`)
    .max(CONTACT_MESSAGE_MAX, `El mensaje no puede superar los ${CONTACT_MESSAGE_MAX} caracteres`),
  website: z.string().max(200).optional().default(''),
  startedAt: z.number().int().nonnegative(),
});
export type ContactRequest = z.infer<typeof contactRequestSchema>;
