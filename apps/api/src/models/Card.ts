import { CARD_IMAGES, CARD_STATUSES } from '@libro/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Cartas con QR: un título y de 1 a 12 imágenes, en el orden de la autora (la primera es la portada de la lista). Las
 * imágenes viven en Cloudinary (`libro/cartas/<id aleatorio>`); aquí solo se guarda cada `publicId` y lo que midió
 * Cloudinary. **No se guarda ninguna URL**: la de entrega se arma al servir y solo sale del API tras validar sesión y
 * desbloqueo. Cada carta es de un libro (`bookId`).
 */
const cardSchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    order: { type: Number, required: true, min: 1, default: 1 },
    status: { type: String, enum: [...CARD_STATUSES], required: true, default: 'published' },
    images: {
      type: [
        new Schema(
          {
            publicId: { type: String, required: true, maxlength: 120 },
            /** Texto alternativo propio (opcional): si falta, se arma con el título al servir. */
            alt: { type: String, trim: true, maxlength: 300 },
            format: { type: String, required: true, maxlength: 10 },
            width: { type: Number, required: true, min: 1 },
            height: { type: Number, required: true, min: 1 },
            bytes: { type: Number, required: true, min: 0 },
          },
          { _id: false },
        ),
      ],
      required: true,
      validate: {
        validator: (list: unknown[]) =>
          list.length >= CARD_IMAGES.min && list.length <= CARD_IMAGES.max,
        message: 'Una carta lleva de 1 a 12 imágenes',
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

cardSchema.index({ bookId: 1, status: 1, order: 1 });
// Una imagen, una carta: el mismo archivo no puede estar en dos cartas (dentro de una, lo impide el esquema de entrada).
cardSchema.index({ 'images.publicId': 1 }, { unique: true });

export type CardAttrs = InferSchemaType<typeof cardSchema>;
export type CardDoc = HydratedDocument<CardAttrs>;
export const Card = model('Card', cardSchema, 'cards');
