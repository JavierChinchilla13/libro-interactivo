import { z } from 'zod';
import { objectIdSchema } from './common.js';

/**
 * Avisos por correo a las lectoras apuntadas a las novedades: uno por elemento publicado (una actualización o un
 * capítulo extra), en cola, con cupo diario y mensual. Solo ADMIN los envía y ve su progreso.
 */
export const NOTIFICATION_KINDS = ['post', 'extra'] as const;
export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const NOTIFICATION_STATUSES = ['queued', 'sending', 'done', 'cancelled', 'failed'] as const;
export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

/** Cuántos correos van en cada lote (máximo de la API de lotes de Resend). */
export const NOTIFICATION_BATCH_SIZE = 100;

export const notificationTargetSchema = z.object({
  kind: notificationKindSchema,
  refId: objectIdSchema,
});
export type NotificationTarget = z.infer<typeof notificationTargetSchema>;

export const notificationTotalsSchema = z.object({
  recipients: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
});
export type NotificationTotals = z.infer<typeof notificationTotalsSchema>;

export const notificationJobSchema = z.object({
  id: objectIdSchema,
  kind: notificationKindSchema,
  refId: objectIdSchema,
  /** El asunto del correo (lo que se ve en la lista). */
  subject: z.string(),
  status: notificationStatusSchema,
  createdAt: z.string(),
  createdBy: z.object({ id: objectIdSchema, name: z.string() }).nullable(),
  /** No se envía antes (fecha de publicación de una actualización programada). */
  notBefore: z.string(),
  /** En pausa hasta (cupo agotado o error temporal). */
  pausedUntil: z.string().optional(),
  finishedAt: z.string().optional(),
  totals: notificationTotalsSchema,
});
export type NotificationJob = z.infer<typeof notificationJobSchema>;

export const notificationListResponseSchema = z.object({
  jobs: z.array(notificationJobSchema),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

/** Cupo de correos que les queda hoy y este mes a los avisos (después de la reserva de los transaccionales). */
export const mailQuotaSchema = z.object({
  todayLeft: z.number().int().nonnegative(),
  monthLeft: z.number().int().nonnegative(),
  /** Reserva diaria para los correos de la cuenta (recuperar contraseña, avisos de respaldo, contacto…). */
  reserve: z.number().int().nonnegative(),
  dailyLimit: z.number().int().positive(),
  monthlyLimit: z.number().int().positive(),
});
export type MailQuota = z.infer<typeof mailQuotaSchema>;

export const notificationPreviewSchema = z.object({
  /** ¿Se puede avisar? (`reason` dice por qué no). */
  available: z.boolean(),
  reason: z.string().optional(),
  /** A cuántas lectoras se enviaría ahora. */
  recipients: z.number().int().nonnegative(),
  quota: mailQuotaSchema,
  /** Días que tardaría en salir todo con el cupo de hoy (1 = hoy). */
  estimatedDays: z.number().int().nonnegative(),
  /** No sale antes (actualización programada). */
  notBefore: z.string().optional(),
  /** El aviso ya pedido para este elemento (cada elemento se avisa una sola vez). */
  existing: notificationJobSchema.nullable(),
});
export type NotificationPreview = z.infer<typeof notificationPreviewSchema>;

/** Respuesta de pedir un aviso: el aviso y si se creó ahora (`false` = ya existía: doble clic u otra persona). */
export const createNotificationResponseSchema = z.object({
  job: notificationJobSchema,
  created: z.boolean(),
});
export type CreateNotificationResponse = z.infer<typeof createNotificationResponseSchema>;

export const notificationParamsSchema = z.object({ notificationId: objectIdSchema });
export type NotificationParams = z.infer<typeof notificationParamsSchema>;
