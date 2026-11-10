import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Contador propio del cupo de correos del proveedor: un documento por **día UTC** (el día de Resend), con los correos
 * enviados de cada tipo. El mes es la suma de sus días. Sin datos personales. Se guardan 13 meses.
 */
const mailUsageSchema = new Schema(
  {
    /** `AAAA-MM-DD` en UTC. */
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    /** Correos de la cuenta (recuperar contraseña, contacto, aviso de respaldo, confirmación…). */
    transactional: { type: Number, required: true, default: 0, min: 0 },
    /** Avisos de novedades. */
    notifications: { type: Number, required: true, default: 0, min: 0 },
    /** Para borrar el documento pasado un año (TTL). */
    expireAt: { type: Date, required: true },
  },
  { versionKey: false },
);

mailUsageSchema.index({ day: 1 }, { unique: true });
mailUsageSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type MailUsageAttrs = InferSchemaType<typeof mailUsageSchema>;
export const MailUsage = model('MailUsage', mailUsageSchema, 'mailUsage');
