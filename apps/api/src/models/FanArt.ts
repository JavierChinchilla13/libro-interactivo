import { FAN_ART_STATUSES } from '@libro/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Fan arts. Los carga la autora desde el panel (v1: sin envío público). Solo se
 * muestran los publicados **con el permiso del artista confirmado**.
 */
const fanArtSchema = new Schema(
  {
    /** Vacío = toda la saga. */
    bookId: { type: Schema.Types.ObjectId, ref: 'Book' },
    title: { type: String, trim: true, maxlength: 160 },
    image: { type: Schema.Types.Mixed, required: true },
    artistName: { type: String, required: true, trim: true, maxlength: 120 },
    artistLink: { type: String, trim: true, maxlength: 500 },
    permissionConfirmed: { type: Boolean, required: true, default: false },
    /** Privado: cómo o cuándo se obtuvo el permiso. */
    permissionNote: { type: String, trim: true, maxlength: 500 },
    order: { type: Number, required: true, min: 1, default: 1 },
    status: { type: String, enum: [...FAN_ART_STATUSES], required: true, default: 'draft' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

fanArtSchema.index({ status: 1, order: 1 });
fanArtSchema.index({ bookId: 1, status: 1 });

export type FanArtAttrs = InferSchemaType<typeof fanArtSchema>;
export type FanArtDoc = HydratedDocument<FanArtAttrs>;
export const FanArt = model('FanArt', fanArtSchema, 'fanArts');
