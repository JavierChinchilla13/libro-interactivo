import { BOOK_STATUSES } from '@libro/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Libros de la saga. `cover`, `theme` y `wikiSections` se guardan como datos libres y
 * se validan con los esquemas de `@libro/shared` en cada escritura (el HTML se sanea antes de guardar).
 */
const bookSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    tagline: { type: String, trim: true, maxlength: 200 },
    synopsis: { type: String, default: '' },
    genres: { type: [String], default: [] },
    contentWarning: { type: String },
    minAge: { type: Number, min: 0, max: 99 },
    isbn: { type: String, trim: true, maxlength: 20 },
    cover: { type: Schema.Types.Mixed },
    order: { type: Number, required: true, min: 1 },
    status: { type: String, enum: [...BOOK_STATUSES], required: true, default: 'draft' },
    releaseDate: { type: Date },
    purchaseLinks: { type: [Schema.Types.Mixed], default: [] },
    wikiSections: { type: [Schema.Types.Mixed], default: [] },
    theme: { type: Schema.Types.Mixed },
  },
  { timestamps: true, minimize: false },
);

bookSchema.index({ status: 1, order: 1 });

export type BookAttrs = InferSchemaType<typeof bookSchema>;
export type BookDoc = HydratedDocument<BookAttrs>;
export const Book = model('Book', bookSchema, 'books');
