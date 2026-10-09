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
    /** Landing: frase principal y presentación del universo. */
    universe: {
      headline: { type: String, trim: true, maxlength: 200 },
      introHtml: { type: String, default: '' },
    },
    /** «Conoce a la autora». `publicEmail` se muestra; `contact.recipientEmail` nunca. */
    author: {
      name: { type: String, trim: true, maxlength: 120 },
      bioHtml: { type: String, default: '' },
      photo: { type: Schema.Types.Mixed },
      publicEmail: { type: String, trim: true, maxlength: 254 },
    },
    social: {
      type: [
        {
          _id: false,
          label: { type: String, required: true },
          url: { type: String, required: true },
        },
      ],
      default: [],
    },
    /** Texto de «Bloqueado: avanza en tu lectura» editable por la autora. */
    lock: { message: { type: String, trim: true, maxlength: 200 } },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type SiteSettingsAttrs = InferSchemaType<typeof siteSettingsSchema>;
export type SiteSettingsDoc = HydratedDocument<SiteSettingsAttrs>;
export const SiteSettings = model('SiteSettings', siteSettingsSchema, 'siteSettings');
