import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const BOOK_STATUSES = ['draft', 'upcoming', 'published', 'archived'] as const;

/**
 * Libros de la saga. En la fase 6 solo existe lo mínimo que necesitan los
 * quizzes (identidad, orden y estado); el resto de campos (portada, sinopsis, tema, wiki…) llega en la fase 7.
 */
const bookSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    order: { type: Number, required: true, min: 1 },
    status: { type: String, enum: [...BOOK_STATUSES], required: true, default: 'draft' },
  },
  { timestamps: true },
);

bookSchema.index({ status: 1, order: 1 });

export type BookAttrs = InferSchemaType<typeof bookSchema>;
export type BookDoc = HydratedDocument<BookAttrs>;
export const Book = model('Book', bookSchema, 'books');
