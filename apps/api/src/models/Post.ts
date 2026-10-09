import { POST_CATEGORIES, POST_STATUSES, POST_TEMPLATES } from '@libro/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Actualizaciones con plantillas. `data` es libre en la base y se valida con el esquema
 * Zod de su `template` (`@libro/shared`): agregar una plantilla no cambia este modelo.
 */
const postSchema = new Schema(
  {
    /** Vacío = toda la saga. */
    bookId: { type: Schema.Types.ObjectId, ref: 'Book' },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    template: { type: String, enum: [...POST_TEMPLATES], required: true },
    data: { type: Schema.Types.Mixed, required: true, default: {} },
    category: { type: String, enum: [...POST_CATEGORIES], required: true },
    thumbnail: { type: Schema.Types.Mixed },
    /** Primer párrafo en texto plano (se calcula al guardar). */
    excerpt: { type: String, default: '', maxlength: 300 },
    /** Denormalizado de `data.startsAt` en la plantilla de evento. */
    eventAt: { type: Date },
    status: { type: String, enum: [...POST_STATUSES], required: true, default: 'draft' },
    /** Una fecha futura la deja sin mostrar hasta entonces (programada). */
    publishedAt: { type: Date },
    featured: { type: Boolean, required: true, default: false },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, minimize: false },
);

postSchema.index({ slug: 1 }, { unique: true });
postSchema.index({ status: 1, publishedAt: -1 });
postSchema.index({ status: 1, category: 1, publishedAt: -1 });
postSchema.index({ featured: 1, status: 1, publishedAt: -1 });
postSchema.index({ eventAt: 1 }, { partialFilterExpression: { eventAt: { $exists: true } } });

export type PostAttrs = InferSchemaType<typeof postSchema>;
export type PostDoc = HydratedDocument<PostAttrs>;
export const Post = model('Post', postSchema, 'posts');
