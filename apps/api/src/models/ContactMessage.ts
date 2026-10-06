import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Mensajes del formulario de contacto. Solo se guardan si
 * `siteSettings.contact.storeMessages` está activo; `expiresAt` los elimina pasado el plazo de retención.
 */
const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, maxlength: 254 },
    message: { type: String, required: true, maxlength: 5000 },
    /** IP con HMAC (nunca en claro) y navegador, solo para anti-abuso. */
    ipHash: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 200 },
    /** Si el correo a la autora salió bien. */
    emailSent: { type: Boolean, required: true, default: false },
    handled: { type: Boolean, required: true, default: false },
    handledAt: { type: Date },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

contactMessageSchema.index({ handled: 1, createdAt: -1 });
contactMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ContactMessageAttrs = InferSchemaType<typeof contactMessageSchema>;
export type ContactMessageDoc = HydratedDocument<ContactMessageAttrs>;
export const ContactMessage = model('ContactMessage', contactMessageSchema, 'contactMessages');
