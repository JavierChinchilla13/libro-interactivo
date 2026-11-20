import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const ATTEMPT_STATUSES = ['in_progress', 'completed', 'abandoned'] as const;

const stageEntrySchema = new Schema(
  {
    stageId: { type: String, required: true },
    /** Orden barajado en que se entregaron las preguntas. */
    questionOrder: { type: [String], required: true },
    /** Orden barajado de las respuestas de cada pregunta (ausente en intentos anteriores: orden de la autora). */
    answerOrder: {
      type: [
        new Schema(
          {
            questionId: { type: String, required: true },
            answerIds: { type: [String], required: true },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    answers: {
      type: [
        new Schema(
          {
            questionId: { type: String, required: true },
            answerId: { type: String, required: true },
            answeredAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    tally: {
      type: [
        new Schema(
          { resultKey: { type: String, required: true }, count: { type: Number, required: true } },
          { _id: false },
        ),
      ],
      default: [],
    },
    resultKey: { type: String },
    /** Si hubo empate: los resultados empatados entre los que se eligió al azar. */
    tiedKeys: { type: [String], default: undefined },
    completedAt: { type: Date },
  },
  { _id: false },
);

/**
 * Intento de un lector. Tiene estado porque el servidor baraja y las etapas
 * condicionales dependen de la anterior. Un intento fija la versión del quiz con la que empezó.
 */
const quizAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    /**
     * La versión PUBLICADA con la que se jugó. Obligatoria salvo en una prueba del BORRADOR del equipo, que no tiene
     * versión (nunca se crea una `QuizVersion` para probar): ahí va `draftSnapshot` y `version` es 0.
     */
    quizVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'QuizVersion',
      required(this: { draftSnapshot?: unknown }) {
        return this.draftSnapshot === undefined || this.draftSnapshot === null;
      },
    },
    version: { type: Number, required: true, min: 0 },
    /**
     * Copia CONGELADA del borrador del quiz (contenido ya validado y saneado como al publicar) con la que se juega una
     * prueba del equipo. Solo la lleva un intento `isTest` de EDITOR o ADMIN. Nunca sale del servidor: `select: false`
     * hace que ninguna consulta la cargue salvo que se pida con `+draftSnapshot` (solo al enviar las respuestas de ese
     * intento), y las respuestas se arman con los mismos constructores de payload, que nunca llevan `resultKey`.
     */
    draftSnapshot: { type: Schema.Types.Mixed, select: false },
    attemptNumber: { type: Number, required: true, min: 1 },
    status: { type: String, enum: [...ATTEMPT_STATUSES], required: true, default: 'in_progress' },
    stages: { type: [stageEntrySchema], default: [] },
    finalResultKey: { type: String },
    distribution: {
      type: [
        new Schema(
          {
            resultKey: { type: String, required: true },
            percent: { type: Number, required: true },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    /** Intento de prueba de un editor/administrador: no cuenta en progreso ni estadísticas. */
    isTest: { type: Boolean, required: true, default: false },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date },
    /** TTL: solo existe mientras el intento está en curso; al completarlo se elimina. */
    expireAt: { type: Date },
  },
  { timestamps: true },
);

quizAttemptSchema.index({ userId: 1, quizId: 1, attemptNumber: -1 });
quizAttemptSchema.index({ userId: 1, bookId: 1, completedAt: -1 });
// Un solo intento abierto por persona y quiz (también protege contra dos "iniciar" simultáneos).
quizAttemptSchema.index(
  { userId: 1, quizId: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress' } },
);
quizAttemptSchema.index({ quizVersionId: 1, finalResultKey: 1 });
quizAttemptSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type QuizAttemptAttrs = InferSchemaType<typeof quizAttemptSchema>;
export type QuizAttemptDoc = HydratedDocument<QuizAttemptAttrs>;
export const QuizAttempt = model('QuizAttempt', quizAttemptSchema, 'quizAttempts');
