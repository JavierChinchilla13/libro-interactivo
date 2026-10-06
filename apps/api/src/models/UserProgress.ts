import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const unlockedSchema = new Schema(
  {
    kind: { type: String, enum: ['quiz', 'game'], required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    accessTokenId: { type: Schema.Types.ObjectId },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const completedSchema = new Schema(
  {
    kind: { type: String, enum: ['quiz', 'game'], required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    firstCompletedAt: { type: Date, required: true },
    /** Último intento completado (el «resultado vigente»). */
    currentAttemptId: { type: Schema.Types.ObjectId, required: true },
    currentResultKey: { type: String },
  },
  { _id: false },
);

/**
 * Avance de una persona en un libro. Solo lo escribe el servidor y es
 * derivable de los intentos. Los intentos de prueba (`isTest`) nunca llegan aquí.
 */
const userProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    /** Desbloqueos por QR (fase 8). */
    unlocked: { type: [unlockedSchema], default: [] },
    completed: { type: [completedSchema], default: [] },
    /** Se fija una sola vez al completar todos los quizzes y el juego (fase 10). */
    bookCompletedAt: { type: Date },
  },
  { timestamps: true },
);

userProgressSchema.index({ userId: 1, bookId: 1 }, { unique: true });
userProgressSchema.index({ bookId: 1 });

export type UserProgressAttrs = InferSchemaType<typeof userProgressSchema>;
export type UserProgressDoc = HydratedDocument<UserProgressAttrs>;
export const UserProgress = model('UserProgress', userProgressSchema, 'userProgress');
