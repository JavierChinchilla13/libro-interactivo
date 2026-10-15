import { z } from 'zod';
import { objectIdSchema } from './common.js';

/**
 * Contrato del juego entre web y api. Lo que sale del servidor es siempre UNA escena en vista pública: sin el destino de
 * cada decisión (el cliente no puede deducir cuál es mortal). La historia vive en `@libro/game-core`.
 */

const percent = z.number().min(0).max(100);

const gameImageSchema = z.object({
  url: z.string().min(1),
  alt: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const sceneBackgroundSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('color'), color: z.string().min(1).max(64) }),
  z.object({ type: z.literal('image'), image: gameImageSchema }),
]);

export const LAYER_ANIMATION_TYPES = ['float', 'drift', 'pulse', 'rise', 'sway'] as const;

const layerBase = {
  id: z.string().min(1),
  x: percent,
  y: percent,
  width: z.number().positive().max(200),
  zIndex: z.number().int().optional(),
  animation: z
    .object({
      type: z.enum(LAYER_ANIMATION_TYPES),
      durationMs: z.number().int().positive().optional(),
      delayMs: z.number().int().min(0).optional(),
    })
    .optional(),
};

export const sceneLayerSchema = z.discriminatedUnion('kind', [
  z.object({ ...layerBase, kind: z.literal('image'), image: gameImageSchema }),
  z.object({
    ...layerBase,
    kind: z.literal('shape'),
    shape: z.enum(['circle', 'rect', 'triangle']),
    color: z.string().min(1).max(64),
    aspect: z.number().positive().optional(),
  }),
]);

export const hotspotSchema = z.object({
  x: percent,
  y: percent,
  w: z.number().positive().max(100),
  h: z.number().positive().max(100),
});

export const publicChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  hotspot: hotspotSchema.optional(),
});

export const publicSceneSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  background: sceneBackgroundSchema,
  layers: z.array(sceneLayerSchema),
  text: z.string(),
  choices: z.array(publicChoiceSchema),
  ending: z
    .object({
      key: z.string(),
      kind: z.enum(['completed', 'failed']),
      title: z.string(),
      text: z.string(),
    })
    .optional(),
});
export type PublicGameScene = z.infer<typeof publicSceneSchema>;

export const gameSessionStatusSchema = z.enum(['in_progress', 'completed', 'failed', 'abandoned']);

export const gameSessionResponseSchema = z.object({
  sessionId: objectIdSchema,
  bookId: objectIdSchema,
  title: z.string(),
  status: gameSessionStatusSchema,
  attemptNumber: z.number().int().min(1),
  /** Partida de prueba de una editora o administradora: no cuenta en el avance ni en las estadísticas. */
  isTest: z.boolean(),
  scene: publicSceneSchema,
});
export type GameSessionResponse = z.infer<typeof gameSessionResponseSchema>;

export const gameChoiceRequestSchema = z.object({
  choiceId: z.string().min(1).max(80),
});
export type GameChoiceRequest = z.infer<typeof gameChoiceRequestSchema>;

/** Panel de administración (solo lectura): la historia publicada de cada libro. */
export const adminGameStoryResponseSchema = z.object({
  stories: z.array(
    z.object({
      id: objectIdSchema,
      bookId: objectIdSchema,
      version: z.number().int(),
      status: z.enum(['draft', 'published', 'archived']),
      title: z.string(),
      sceneCount: z.number().int(),
      endingCount: z.number().int(),
      sourceHash: z.string(),
    }),
  ),
});
export type AdminGameStoriesResponse = z.infer<typeof adminGameStoryResponseSchema>;
