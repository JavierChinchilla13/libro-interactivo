import { REVIEW_STATUSES } from '@libro/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Reseñas de lectores, cargadas por la autora. Texto plano: nunca HTML. La autora decide
 * cuáles se muestran con `status`.
 */
const reviewSchema = new Schema(
  {
    /** Vacío = toda la saga. */
    bookId: { type: Schema.Types.ObjectId, ref: 'Book' },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    authorName: { type: String, required: true, trim: true, maxlength: 80 },
    source: { type: String, trim: true, maxlength: 120 },
    rating: { type: Number, min: 1, max: 5 },
    order: { type: Number, required: true, min: 1, default: 1 },
    status: { type: String, enum: [...REVIEW_STATUSES], required: true, default: 'published' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

reviewSchema.index({ status: 1, order: 1 });
reviewSchema.index({ bookId: 1, status: 1 });

export type ReviewAttrs = InferSchemaType<typeof reviewSchema>;
export type ReviewDoc = HydratedDocument<ReviewAttrs>;
export const Review = model('Review', reviewSchema, 'reviews');
