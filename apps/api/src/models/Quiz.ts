import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const QUIZ_STATUSES = ['draft', 'published', 'archived'] as const;

/**
 * Quiz en edición. El contenido (`settings`, `stages`, `results`, `image`) se guarda
 * como datos libres y se valida con `quizContentSchema` (packages/shared) al guardar y al publicar;
 * publicar crea un snapshot inmutable en `quizVersions`.
 */
const quizSchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
    /** Posición en la secuencia de progresión (Quiz 1 → 2 → … → juego). */
    order: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    instructionsHtml: { type: String, default: '' },
    image: { type: Schema.Types.Mixed },
    status: { type: String, enum: [...QUIZ_STATUSES], required: true, default: 'draft' },
    /** Última versión publicada (0 = nunca). */
    currentVersion: { type: Number, required: true, default: 0, min: 0 },
    lastPublishedAt: { type: Date },
    settings: { type: Schema.Types.Mixed, required: true },
    draft: {
      stages: { type: Schema.Types.Mixed, required: true, default: [] },
      results: { type: Schema.Types.Mixed, required: true, default: [] },
      updatedAt: { type: Date },
      updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
  },
  { timestamps: true, minimize: false },
);

quizSchema.index({ bookId: 1, slug: 1 }, { unique: true });
// El orden solo es único entre los quizzes vivos: uno archivado libera su posición.
quizSchema.index(
  { bookId: 1, order: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['draft', 'published'] } } },
);
quizSchema.index({ bookId: 1, status: 1 });

export type QuizAttrs = InferSchemaType<typeof quizSchema>;
export type QuizDoc = HydratedDocument<QuizAttrs>;
export const Quiz = model('Quiz', quizSchema, 'quizzes');
