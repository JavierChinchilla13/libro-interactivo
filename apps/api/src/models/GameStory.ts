import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const GAME_STORY_STATUSES = ['draft', 'published', 'archived'] as const;

/**
 * Historia del juego de un libro, versionada. La define el desarrollador en `@libro/game-core` y se carga con
 * `seed:game`; no se edita en el panel. Una versión publicada es inmutable (cambios = nueva versión).
 */
const gameStorySchema = new Schema(
  {
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    version: { type: Number, required: true, min: 1 },
    status: { type: String, enum: [...GAME_STORY_STATUSES], required: true, default: 'published' },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    startSceneId: { type: String, required: true },
    /** `Scene[]` de `@libro/game-core` (se valida al cargar con `assertValidStory`). */
    scenes: { type: Schema.Types.Mixed, required: true },
    endings: { type: Schema.Types.Mixed, required: true },
    sourceHash: { type: String, required: true },
  },
  { timestamps: true },
);

gameStorySchema.index({ bookId: 1, version: 1 }, { unique: true });
// Una sola historia publicada por libro.
gameStorySchema.index(
  { bookId: 1 },
  { unique: true, partialFilterExpression: { status: 'published' } },
);

export type GameStoryAttrs = InferSchemaType<typeof gameStorySchema>;
export type GameStoryDoc = HydratedDocument<GameStoryAttrs>;
export const GameStory = model('GameStory', gameStorySchema, 'gameStories');
