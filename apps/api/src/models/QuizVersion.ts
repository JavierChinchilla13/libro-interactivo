import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Snapshot inmutable de un quiz publicado. Es lo que ven los lectores y a lo
 * que apuntan los intentos: editar el borrador nunca altera un resultado ya guardado.
 */
const immutable = true;

const quizVersionSchema = new Schema(
  {
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true, immutable },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true, immutable },
    version: { type: Number, required: true, min: 1, immutable },
    title: { type: String, required: true, immutable },
    instructionsHtml: { type: String, default: '', immutable },
    image: { type: Schema.Types.Mixed, immutable },
    settings: { type: Schema.Types.Mixed, required: true, immutable },
    stages: { type: Schema.Types.Mixed, required: true, immutable },
    results: { type: Schema.Types.Mixed, required: true, immutable },
    publishedAt: { type: Date, required: true, immutable },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable },
    /** SHA-256 del contenido canónico: detecta publicar sin cambios. */
    contentHash: { type: String, required: true, immutable },
  },
  { timestamps: true, minimize: false },
);

quizVersionSchema.index({ quizId: 1, version: 1 }, { unique: true });
quizVersionSchema.index({ bookId: 1 });

// Sin actualizaciones ni borrados: ni siquiera desde el código de la aplicación.
quizVersionSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'findOneAndReplace',
    'replaceOne',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  function () {
    throw new Error('Las versiones publicadas de un quiz son inmutables');
  },
);

export type QuizVersionAttrs = InferSchemaType<typeof quizVersionSchema>;
export type QuizVersionDoc = HydratedDocument<QuizVersionAttrs>;
export const QuizVersion = model('QuizVersion', quizVersionSchema, 'quizVersions');
