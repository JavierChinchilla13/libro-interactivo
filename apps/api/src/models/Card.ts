import { CARD_STATUSES } from '@libro/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Cartas con QR: un título y UNA imagen de frente. La imagen vive en Cloudinary (`libro/cartas/<id aleatorio>`); aquí
 * solo se guarda su `publicId` y lo que midió Cloudinary. **No se guarda ninguna URL**: la de entrega se arma al servir
 * y solo sale del API tras validar sesión y desbloqueo. Cada carta es de un libro (`bookId`).
 */
const cardSchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    alt: { type: String, trim: true, maxlength: 300 },
    order: { type: Number, required: true, min: 1, default: 1 },
    status: { type: String, enum: [...CARD_STATUSES], required: true, default: 'published' },
    image: {
      type: new Schema(
        {
          publicId: { type: String, required: true, maxlength: 120 },
          format: { type: String, required: true, maxlength: 10 },
          width: { type: Number, required: true, min: 1 },
          height: { type: Number, required: true, min: 1 },
          bytes: { type: Number, required: true, min: 0 },
        },
        { _id: false },
      ),
      required: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

cardSchema.index({ bookId: 1, status: 1, order: 1 });
// Una imagen, una carta: el mismo archivo no puede estar en dos cartas.
cardSchema.index({ 'image.publicId': 1 }, { unique: true });

export type CardAttrs = InferSchemaType<typeof cardSchema>;
export type CardDoc = HydratedDocument<CardAttrs>;
export const Card = model('Card', cardSchema, 'cards');
