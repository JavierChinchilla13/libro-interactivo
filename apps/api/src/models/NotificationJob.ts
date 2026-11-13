import { NOTIFICATION_KINDS, NOTIFICATION_STATUSES } from '@libro/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Un aviso por correo de un elemento publicado (actualización o capítulo extra). Es también el registro de envíos:
 * quién lo pidió, cuándo, de qué elemento y cuántos destinatarios (sin correos). El índice único `{kind, refId}`
 * garantiza que cada elemento se avisa una sola vez, también ante doble clic o dos personas a la vez.
 */
const notificationJobSchema = new Schema(
  {
    kind: { type: String, enum: [...NOTIFICATION_KINDS], required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** No se envía antes (fecha de publicación de una actualización programada). */
    notBefore: { type: Date, required: true },
    /** Lo que se envía, congelado al pedir el aviso (si después se edita el elemento, el correo no cambia). */
    content: {
      type: new Schema(
        {
          subject: { type: String, required: true, maxlength: 200 },
          title: { type: String, required: true, maxlength: 200 },
          summary: { type: String, maxlength: 400 },
          imageUrl: { type: String, maxlength: 1000 },
          imageAlt: { type: String, maxlength: 300 },
          /** Dirección del botón «Ver en Universo Memorias» (ruta del sitio, sin dominio). */
          path: { type: String, required: true, maxlength: 300 },
        },
        { _id: false },
      ),
      required: true,
    },
    status: { type: String, enum: [...NOTIFICATION_STATUSES], required: true, default: 'queued' },
    totals: {
      type: new Schema(
        {
          recipients: { type: Number, required: true, default: 0, min: 0 },
          sent: { type: Number, required: true, default: 0, min: 0 },
          skipped: { type: Number, required: true, default: 0, min: 0 },
          failed: { type: Number, required: true, default: 0, min: 0 },
        },
        { _id: false },
      ),
      required: true,
      default: () => ({}),
    },
    /** Reserva del trabajador: un solo proceso trabaja este aviso a la vez. */
    leaseUntil: { type: Date },
    /** En pausa (cupo agotado o error temporal del proveedor) hasta esta fecha. */
    pausedUntil: { type: Date },
    /** Último error, sin datos personales. */
    lastError: { type: String, maxlength: 300 },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

notificationJobSchema.index({ kind: 1, refId: 1 }, { unique: true });
notificationJobSchema.index({ status: 1, notBefore: 1 });
notificationJobSchema.index({ createdAt: -1 });

export type NotificationJobAttrs = InferSchemaType<typeof notificationJobSchema>;
export type NotificationJobDoc = HydratedDocument<NotificationJobAttrs>;
export const NotificationJob = model('NotificationJob', notificationJobSchema, 'notificationJobs');
