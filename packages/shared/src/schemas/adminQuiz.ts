import { z } from 'zod';
import { slugSchema } from './book.js';
import { imageRefSchema, objectIdSchema } from './common.js';
import { factSchema, mediaSchema, quizIdSchema, quizSettingsSchema, revealSchema } from './quiz.js';

/**
 * Edición de quizzes (panel). El BORRADOR admite contenido incompleto (textos vacíos, preguntas sin
 * respuestas…) para poder guardar a medias; solo `validate` y `publish` exigen el contenido completo
 * (`quizContentSchema` + integridad del motor).
 */
const draftAnswerSchema = z.object({
  id: quizIdSchema,
  text: z.string().max(500),
  resultKey: z.string().max(64),
});

const draftQuestionSchema = z.object({
  id: quizIdSchema,
  text: z.string().max(1000),
  image: imageRefSchema.optional(),
  answers: z.array(draftAnswerSchema).max(12),
});

const draftStageSchema = z.object({
  id: quizIdSchema,
  order: z.number().int().min(1),
  title: z.string().max(120).optional(),
  shuffleQuestions: z.boolean().default(true),
  conditionStageId: quizIdSchema.optional(),
  conditionResultKey: quizIdSchema.optional(),
  producesFinal: z.boolean(),
  questions: z.array(draftQuestionSchema).max(60),
});

const draftResultSchema = z.object({
  key: quizIdSchema,
  stageId: quizIdSchema,
  title: z.string().max(160),
  /** HTML: se sanitiza en el servidor al guardar. */
  description: z.string().max(20_000).optional(),
  media: mediaSchema.optional(),
  reveal: revealSchema.optional(),
  facts: z.array(factSchema).max(12).optional(),
});

/** Contenido que guarda el editor (reemplaza el borrador completo). */
export const quizDraftSchema = z.object({
  title: z.string().min(1).max(160),
  /** HTML: se sanitiza en el servidor al guardar. */
  instructionsHtml: z.string().max(20_000).default(''),
  image: imageRefSchema.optional(),
  settings: quizSettingsSchema,
  stages: z.array(draftStageSchema).max(20),
  results: z.array(draftResultSchema).max(60),
});
export type QuizDraft = z.infer<typeof quizDraftSchema>;
export type QuizDraftPayload = z.input<typeof quizDraftSchema>;

export const createQuizRequestSchema = z.object({
  bookId: objectIdSchema,
  slug: slugSchema,
  order: z.number().int().min(1),
  title: z.string().min(1).max(160),
  /** «¿Se puede repetir?» se elige al crear (por defecto sí). */
  settings: quizSettingsSchema.default({ allowRetake: true, showBreakdown: false }),
});
export type CreateQuizRequest = z.infer<typeof createQuizRequestSchema>;

export const updateQuizMetaRequestSchema = z
  .object({ slug: slugSchema.optional(), order: z.number().int().min(1).optional() })
  .refine((value) => value.slug !== undefined || value.order !== undefined, {
    message: 'Indica el slug o el orden',
  });
export type UpdateQuizMetaRequest = z.infer<typeof updateQuizMetaRequestSchema>;

export const quizListQuerySchema = z.object({
  bookId: objectIdSchema,
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export const quizSummarySchema = z.object({
  id: objectIdSchema,
  bookId: objectIdSchema,
  slug: z.string(),
  order: z.number().int(),
  title: z.string(),
  status: z.enum(['draft', 'published', 'archived']),
  currentVersion: z.number().int(),
  lastPublishedAt: z.string().optional(),
  allowRetake: z.boolean(),
  showBreakdown: z.boolean(),
  updatedAt: z.string(),
});
export type QuizSummary = z.infer<typeof quizSummarySchema>;
export const quizListResponseSchema = z.object({ quizzes: z.array(quizSummarySchema) });

export const quizDetailResponseSchema = quizSummarySchema.extend({
  draft: quizDraftSchema,
  /** `true` si el borrador difiere de la última versión publicada (o nunca se publicó). */
  hasUnpublishedChanges: z.boolean(),
});
export type QuizDetailResponse = z.infer<typeof quizDetailResponseSchema>;

export const quizVersionsResponseSchema = z.object({
  versions: z.array(
    z.object({
      version: z.number().int(),
      publishedAt: z.string(),
      publishedBy: objectIdSchema,
      contentHash: z.string(),
      /** Intentos de lectores (sin pruebas) que usaron esta versión. */
      attempts: z.number().int(),
    }),
  ),
});
export type QuizVersionsResponse = z.infer<typeof quizVersionsResponseSchema>;
