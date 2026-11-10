import { z } from 'zod';
import { ADULT_AGE } from '../legal.js';
import { ageFromBirth, type BirthMonth } from '../age.js';

/**
 * Avisos por correo con novedades de la autora (actualizaciones y capítulos extra). Opcionales y solo para mayores de
 * edad: la casilla va aparte de los consentimientos de la cuenta y empieza desmarcada.
 */

/** Edad mínima para apuntarse a los avisos (con la fecha de nacimiento guardada). */
export const NEWSLETTER_MIN_AGE = ADULT_AGE;

export const NEWSLETTER_LABEL = 'Quiero recibir correos con novedades de la autora';
export const NEWSLETTER_MINOR_MESSAGE =
  'Solo las personas mayores de 18 años pueden apuntarse a los correos de novedades.';

/** ¿Puede apuntarse quien nació en ese mes y año? (edad conservadora, como en el registro). */
export function canSubscribeToNewsletter(birth: BirthMonth | undefined, now: Date): boolean {
  return birth !== undefined && ageFromBirth(birth, now) >= NEWSLETTER_MIN_AGE;
}

/**
 * - `none`: no está apuntada (nunca, o se dio de baja).
 * - `pending`: pidió los avisos pero falta que confirme su correo (enlace enviado); hasta entonces no recibe nada.
 * - `subscribed`: apuntada.
 */
export const NEWSLETTER_STATUSES = ['none', 'pending', 'subscribed'] as const;
export const newsletterStatusSchema = z.enum(NEWSLETTER_STATUSES);
export type NewsletterStatus = z.infer<typeof newsletterStatusSchema>;

export const newsletterStateSchema = z.object({
  status: newsletterStatusSchema,
  /** Si puede apuntarse (mayor de 18 con fecha de nacimiento guardada). */
  eligible: z.boolean(),
  subscribedAt: z.string().optional(),
  /** Desde cuándo espera la confirmación (`pending`). */
  pendingSince: z.string().optional(),
});
export type NewsletterState = z.infer<typeof newsletterStateSchema>;

export const updateNewsletterRequestSchema = z.object({ subscribed: z.boolean() });
export type UpdateNewsletterRequest = z.infer<typeof updateNewsletterRequestSchema>;

/** Token del enlace de confirmación (llega por correo). */
export const confirmNewsletterRequestSchema = z.object({
  token: z.string().min(20, 'Enlace no válido').max(200, 'Enlace no válido'),
});
export type ConfirmNewsletterRequest = z.infer<typeof confirmNewsletterRequestSchema>;

/** Token de baja en la dirección (`?t=`): lo usan el enlace del correo y el botón de baja del cliente de correo. */
export const unsubscribeQuerySchema = z.object({
  t: z.string().min(1).max(200),
  /** `enlace` cuando llega desde la página `/baja` (enlace visible del correo); sin él, el botón del cliente de correo. */
  origen: z.literal('enlace').optional(),
});
export type UnsubscribeQuery = z.infer<typeof unsubscribeQuerySchema>;
