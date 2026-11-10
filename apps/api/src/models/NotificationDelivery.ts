import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Una fila por destinataria de un aviso. **Sin correos**: se leen de `users` al enviar. El índice único `{jobId, userId}`
 * impide dos correos del mismo aviso a la misma persona. `sending` + `batchKey` marcan un lote en curso: si el proceso se
 * cae a mitad, se reintenta con la misma clave de idempotencia (el proveedor no lo repite). Se borran 90 días después
 * de terminar el aviso.
 */
const notificationDeliverySchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'NotificationJob', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'sending', 'sent', 'skipped', 'failed'],
      required: true,
      default: 'pending',
    },
    batchKey: { type: String, maxlength: 64 },
    batchStartedAt: { type: Date },
    sentAt: { type: Date },
    /** Por qué se saltó o falló (sin datos personales): `unsubscribed`, `inactive`, `not_completed`, `unknown`… */
    reason: { type: String, maxlength: 40 },
    expireAt: { type: Date },
  },
  { versionKey: false },
);

notificationDeliverySchema.index({ jobId: 1, userId: 1 }, { unique: true });
notificationDeliverySchema.index({ jobId: 1, status: 1 });
notificationDeliverySchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type NotificationDeliveryAttrs = InferSchemaType<typeof notificationDeliverySchema>;
export const NotificationDelivery = model(
  'NotificationDelivery',
  notificationDeliverySchema,
  'notificationDeliveries',
);
