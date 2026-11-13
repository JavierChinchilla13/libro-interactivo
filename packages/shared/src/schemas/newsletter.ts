import { z } from 'zod';
import { ADULT_AGE } from '../legal.js';
import { ageFromBirth, type BirthMonth } from '../age.js';
import { birthSchema } from './auth.js';

/**
 * Avisos por correo con novedades de la autora (actualizaciones y capítulos extra). Opcionales y solo para mayores de
 * edad: la casilla va aparte de los consentimientos de la cuenta y empieza desmarcada.
 */

/** Edad mínima para apuntarse a los avisos (con la fecha de nacimiento guardada). */
export const NEWSLETTER_MIN_AGE = ADULT_AGE;

/** Lo que se le dice a quien llega a apuntarse sin fecha de nacimiento guardada (antes de pedirle el mes y el año). */
export const NEWSLETTER_NEEDS_BIRTH_MESSAGE =
  'Para apuntarte necesitamos tu mes y año de nacimiento: los correos de novedades son solo para mayores de 18 años. Solo guardamos el mes y el año si cumples ese requisito.';

export const NEWSLETTER_LABEL = 'Quiero recibir correos con novedades de la autora';
export const NEWSLETTER_MINOR_MESSAGE =
  'Solo las personas mayores de 18 años pueden apuntarse a los correos de novedades.';

/** ¿Puede apuntarse quien nació en ese mes y año? (edad conservadora, como en el registro). */
export function canSubscribeToNewsletter(birth: BirthMonth | undefined, now: Date): boolean {
  return birth !== undefined && ageFromBirth(birth, now) >= NEWSLETTER_MIN_AGE;
}

/**
 * - `none`: no está apuntado (nunca, o se dio de baja).
 * - `pending`: pidió los avisos pero falta que confirme su correo (enlace enviado); hasta entonces no recibe nada.
 * - `subscribed`: apuntado.
 */
export const NEWSLETTER_STATUSES = ['none', 'pending', 'subscribed'] as const;
export const newsletterStatusSchema = z.enum(NEWSLETTER_STATUSES);
export type NewsletterStatus = z.infer<typeof newsletterStatusSchema>;

export const newsletterStateSchema = z.object({
  status: newsletterStatusSchema,
  /**
   * Si puede apuntarse: mayor de 18 con fecha de nacimiento guardada, o una cuenta SIN fecha (anterior al paso de edad),
   * a la que se le pide el mes y el año al apuntarse (`needsBirth`). Es `false` para quien se sabe menor de 18.
   */
  eligible: z.boolean(),
  /** La cuenta no tiene fecha de nacimiento guardada: al apuntarse hay que mandarla (`birth`). */
  needsBirth: z.boolean().default(false),
  subscribedAt: z.string().optional(),
  /** Desde cuándo espera la confirmación (`pending`). */
  pendingSince: z.string().optional(),
  /**
   * ¿Se le muestra la invitación única del panel? Solo si puede apuntarse, no está apuntado (ni a medias ni dado de
   * baja) y no ha respondido antes. El servidor lo decide; el cliente solo lo pinta.
   */
  invitation: z.boolean().default(false),
});
export type NewsletterState = z.infer<typeof newsletterStateSchema>;

/**
 * Apuntarse o darse de baja. `birth` (mes y año) solo cuenta para apuntarse una cuenta sin fecha guardada: el servidor
 * la valida igual que en el registro y, si la edad no alcanza 18, no guarda nada. Si la cuenta ya tiene fecha, se ignora.
 */
export const updateNewsletterRequestSchema = z.object({
  subscribed: z.boolean(),
  birth: birthSchema.optional(),
});
export type UpdateNewsletterRequest = z.infer<typeof updateNewsletterRequestSchema>;

/** Respuesta «No, gracias» a la invitación del panel («Sí» usa `updateNewsletterRequestSchema`). */
export const invitationAnswerRequestSchema = z.object({ answer: z.literal('declined') });
export type InvitationAnswerRequest = z.infer<typeof invitationAnswerRequestSchema>;

/** Texto de la invitación única del panel. */
export const NEWSLETTER_INVITATION_QUESTION = '¿Quieres recibir novedades de la autora por correo?';

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
