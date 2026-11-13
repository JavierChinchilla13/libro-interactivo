import { z } from 'zod';
import { objectIdSchema } from './common.js';

/**
 * Avisos por correo a los lectores apuntados a las novedades: uno por elemento publicado (una actualización o un
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

/**
 * Vista previa: con `refId`, la de un elemento ya guardado; sin él (una actualización o un extra que aún no se
 * guardó), a cuántos lectores llegaría al publicarlo. De un extra hace falta `bookId` (solo lo reciben
 * quienes terminaron ese libro).
 */
export const notificationPreviewQuerySchema = z.object({
  kind: notificationKindSchema,
  refId: objectIdSchema.optional(),
  bookId: objectIdSchema.optional(),
});
export type NotificationPreviewQuery = z.infer<typeof notificationPreviewQuerySchema>;

export const notificationPreviewSchema = z.object({
  /** ¿Se puede avisar? (`reason` dice por qué no). */
  available: z.boolean(),
  reason: z.string().optional(),
  /** A cuántos lectores se enviaría ahora. */
  recipients: z.number().int().nonnegative(),
  /**
   * ¿El envío tardaría más de un día por los límites del servidor? Es lo único que se sabe del cupo: los límites y lo que
   * queda de ellos cambian con el plan de correo y no se entregan a la web (que no debe mostrarlos).
   */
  continuesNextDays: z.boolean(),
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
