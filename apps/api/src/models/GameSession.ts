import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const GAME_SESSION_STATUSES = ['in_progress', 'completed', 'failed', 'abandoned'] as const;

const pathStepSchema = new Schema(
  {
    sceneId: { type: String, required: true },
    choiceId: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * Partida de una persona. Solo se guardan el camino, las decisiones y el final. Fija la versión de la historia; cada
 * decisión se valida contra la escena actual con una actualización condicionada (el doble envío no avanza dos veces).
 */
const gameSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    storyId: { type: Schema.Types.ObjectId, ref: 'GameStory', required: true },
    storyVersion: { type: Number, required: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: [...GAME_SESSION_STATUSES],
      required: true,
      default: 'in_progress',
    },
    currentSceneId: { type: String, required: true },
    path: { type: [pathStepSchema], default: [] },
    endingKey: { type: String },
    isTest: { type: Boolean, required: true, default: false },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    /** TTL: solo mientras la partida está en curso (se quita al terminar). */
    expireAt: { type: Date },
  },
  { timestamps: true },
);

gameSessionSchema.index({ userId: 1, bookId: 1, startedAt: -1 });
// Una sola partida en curso por persona y libro (las de prueba no cuentan).
gameSessionSchema.index(
  { userId: 1, bookId: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress', isTest: false } },
);
gameSessionSchema.index({ storyId: 1, endingKey: 1 });
gameSessionSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export type GameSessionAttrs = InferSchemaType<typeof gameSessionSchema>;
export type GameSessionDoc = HydratedDocument<GameSessionAttrs>;
export const GameSession = model('GameSession', gameSessionSchema, 'gameSessions');
