import { EXTRA_KINDS, EXTRA_STATUSES } from '@libro/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Capítulos y documentos extra. El archivo vive en almacenamiento PRIVADO (`file.storageKey`);
 * nunca en MongoDB ni público. Se entrega solo tras validar `bookCompletedAt`.
 */
const extraSchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, maxlength: 500 },
    kind: { type: String, enum: [...EXTRA_KINDS], required: true },
    file: {
      storageKey: { type: String },
      mime: { type: String },
      size: { type: Number },
      originalName: { type: String },
    },
    bodyHtml: { type: String },
    order: { type: Number, required: true, min: 1, default: 1 },
    status: { type: String, enum: [...EXTRA_STATUSES], required: true, default: 'draft' },
    publishedAt: { type: Date },
  },
  { timestamps: true, minimize: true },
);

extraSchema.index({ bookId: 1, slug: 1 }, { unique: true });
extraSchema.index({ bookId: 1, status: 1, order: 1 });

export type ExtraAttrs = InferSchemaType<typeof extraSchema>;
export type ExtraDoc = HydratedDocument<ExtraAttrs>;
export const Extra = model('Extra', extraSchema, 'extras');
