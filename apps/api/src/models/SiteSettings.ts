import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Ajustes del sitio: documento único (`key: 'site'`).
 * En la fase 4 solo se usa `contact`; el resto (universo, autora, cómo comprar…) lo llenan las fases 9 y 11.
 */
const siteSettingsSchema = new Schema(
  {
    key: { type: String, enum: ['site'], required: true, unique: true, default: 'site' },
    contact: {
      /** Correo privado donde llegan los mensajes de contacto: nunca se expone en endpoints públicos. */
      recipientEmail: { type: String, trim: true, maxlength: 254 },
      storeMessages: { type: Boolean, required: true, default: true },
      retentionDays: { type: Number, required: true, default: 365, min: 1, max: 3650 },
    },
    /** Mensaje de bienvenida del lector. */
    welcome: {
      enabled: { type: Boolean, required: true, default: false },
      title: { type: String, trim: true, maxlength: 120 },
      bodyHtml: { type: String, default: '' },
      showMode: {
        type: String,
        enum: ['first_login', 'every_login'],
        required: true,
        default: 'every_login',
      },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type SiteSettingsAttrs = InferSchemaType<typeof siteSettingsSchema>;
export type SiteSettingsDoc = HydratedDocument<SiteSettingsAttrs>;
export const SiteSettings = model('SiteSettings', siteSettingsSchema, 'siteSettings');
