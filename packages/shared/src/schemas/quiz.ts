import { z } from 'zod';
import { imageRefSchema, objectIdSchema } from './common.js';

/**
 * Contratos de los quizzes.
 * Hay dos mitades: la DEFINICIÓN del quiz (la ve y edita el panel; incluye `resultKey`) y los
 * PAYLOADS DEL LECTOR (nunca incluyen `resultKey` ni resultados antes de completar el quiz).
 */

// ---------------------------------------------------------------------------
// Definición del quiz (borrador y snapshot)
// ---------------------------------------------------------------------------

/** Identificador estable dentro del quiz (`etapa-1`, `p3`, `r-fuego`…). */
export const quizIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'Usa letras, números, guiones y guion bajo (máx. 64)');

export const videoRefSchema = z.object({
  provider: z.literal('cloudinary'),
  publicId: z.string().min(1),
  url: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  posterUrl: z.string().min(1).optional(),
  alt: z.string(),
});
export type VideoRef = z.infer<typeof videoRefSchema>;

/** Imagen o video corto de un resultado (el video solo existe aquí; los fondos del sitio nunca son video). */
export const mediaSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('image'), image: imageRefSchema }),
  z.object({ kind: z.literal('video'), video: videoRefSchema }),
]);
export type Media = z.infer<typeof mediaSchema>;
export type MediaInput = z.input<typeof mediaSchema>;

/** Secuencia narrativa: líneas que aparecen una a una y un efecto visual con nombre (lo dibuja el frontend). */
export const revealSchema = z.object({
  lines: z.array(z.string().min(1).max(300)).max(12),
  effect: z.string().min(1).max(60).optional(),
});
export type Reveal = z.infer<typeof revealSchema>;

export const quizSettingsSchema = z.object({
  /** En `false` el quiz se juega una sola vez. */
  allowRetake: z.boolean().default(true),
  /** En `true` el resultado muestra el porcentaje de cada resultado. */
  showBreakdown: z.boolean().default(false),
  /** Líneas comunes previas al resultado (p. ej. «Tus resultados se están decodificando…»). */
  revealIntro: revealSchema.optional(),
});
export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const answerDefSchema = z.object({
  id: quizIdSchema,
  text: z.string().min(1).max(500),
  /** Resultado al que suma esta respuesta; debe existir en los `results` de la misma etapa. */
  resultKey: quizIdSchema,
});

export const questionDefSchema = z.object({
  id: quizIdSchema,
  text: z.string().min(1).max(1000),
  image: imageRefSchema.optional(),
  answers: z.array(answerDefSchema).min(2).max(12),
});

export const stageDefSchema = z.object({
  id: quizIdSchema,
  order: z.number().int().min(1),
  title: z.string().min(1).max(120).optional(),
  shuffleQuestions: z.boolean().default(true),
  /** Etapa condicional: solo se ejecuta si el resultado de `conditionStageId` fue `conditionResultKey`. */
  conditionStageId: quizIdSchema.optional(),
  conditionResultKey: quizIdSchema.optional(),
  /** El resultado de esta etapa es el resultado final del quiz. */
  producesFinal: z.boolean(),
  questions: z.array(questionDefSchema).min(1).max(60),
});
export type StageDef = z.infer<typeof stageDefSchema>;

export const factSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(500),
});

export const resultDefSchema = z.object({
  key: quizIdSchema,
  stageId: quizIdSchema,
  title: z.string().min(1).max(160),
  /** HTML sanitizado en el servidor al guardar (la edición llega en la fase 7). */
  description: z.string().max(20_000).optional(),
  media: mediaSchema.optional(),
  reveal: revealSchema.optional(),
  facts: z.array(factSchema).max(12).optional(),
});
export type ResultDef = z.infer<typeof resultDefSchema>;

/** Contenido completo de un quiz: lo mismo en el borrador (`quizzes.draft`) y en cada `quizVersions`. */
export const quizContentSchema = z.object({
  title: z.string().min(1).max(160),
  instructionsHtml: z.string().max(20_000),
  image: imageRefSchema.optional(),
  settings: quizSettingsSchema,
  stages: z.array(stageDefSchema).min(1).max(20),
  results: z.array(resultDefSchema).min(2).max(60),
});
export type QuizContent = z.infer<typeof quizContentSchema>;

// ---------------------------------------------------------------------------
// Payloads del lector (sin `resultKey` en preguntas ni respuestas)
// ---------------------------------------------------------------------------

export const readerAnswerSchema = z.object({ id: quizIdSchema, text: z.string() });
export const readerQuestionSchema = z.object({
  id: quizIdSchema,
  text: z.string(),
  image: imageRefSchema.optional(),
  answers: z.array(readerAnswerSchema),
});
export const stagePayloadSchema = z.object({
  stageId: quizIdSchema,
  title: z.string().optional(),
  /** Ya barajadas por el servidor. */
  questions: z.array(readerQuestionSchema),
});
export type StagePayload = z.infer<typeof stagePayloadSchema>;

/** Resultado entregado SOLO tras completar el quiz. */
export const resultPayloadSchema = z.object({
  key: quizIdSchema,
  title: z.string(),
  description: z.string().optional(),
  media: mediaSchema.optional(),
  /** Secuencia previa común a todos los resultados del quiz. */
  revealIntro: revealSchema.optional(),
  /** Secuencia propia de este resultado. */
  reveal: revealSchema.optional(),
  facts: z.array(factSchema).optional(),
  /** Solo si el quiz tiene `showBreakdown`: porcentaje de cada resultado alcanzado (suma 100). */
  distribution: z
    .array(
      z.object({ key: quizIdSchema, title: z.string(), percent: z.number().int().min(0).max(100) }),
    )
    .optional(),
});
export type ResultPayload = z.infer<typeof resultPayloadSchema>;

export const quizIntroResponseSchema = z.object({
  id: objectIdSchema,
  bookId: objectIdSchema,
  title: z.string(),
  instructionsHtml: z.string(),
  image: imageRefSchema.optional(),
  allowRetake: z.boolean(),
  /** `completed` = ya tiene un resultado. */
  status: z.enum(['available', 'completed']),
  completedCount: z.number().int().min(0),
  inProgressAttemptId: objectIdSchema.optional(),
  /** `false` en un quiz de una sola vez que ya se completó. */
  canStart: z.boolean(),
});
export type QuizIntroResponse = z.infer<typeof quizIntroResponseSchema>;

export const attemptStageResponseSchema = z.object({
  attemptId: objectIdSchema,
  status: z.literal('in_progress'),
  stage: stagePayloadSchema,
});
export const attemptCompletedResponseSchema = z.object({
  attemptId: objectIdSchema,
  status: z.literal('completed'),
  result: resultPayloadSchema,
});
/** Respuesta de iniciar un intento y de enviar las respuestas de una etapa. */
export const attemptResponseSchema = z.discriminatedUnion('status', [
  attemptStageResponseSchema,
  attemptCompletedResponseSchema,
]);
export type AttemptResponse = z.infer<typeof attemptResponseSchema>;

/** Respuestas de UNA etapa: exactamente una respuesta por cada pregunta de la etapa. */
export const submitAnswersRequestSchema = z.object({
  answers: z
    .array(z.object({ questionId: quizIdSchema, answerId: quizIdSchema }))
    .min(1)
    .max(60),
});
export type SubmitAnswersRequest = z.infer<typeof submitAnswersRequestSchema>;

export const attemptParamsSchema = z.object({ attemptId: objectIdSchema });
export const attemptStageParamsSchema = z.object({
  attemptId: objectIdSchema,
  stageId: quizIdSchema,
});
export const quizParamsSchema = z.object({ quizId: objectIdSchema });

// --- Resultados del lector ---

export const resultHistoryItemSchema = z.object({
  attemptId: objectIdSchema,
  attemptNumber: z.number().int().min(1),
  version: z.number().int().min(1),
  completedAt: z.string(),
  resultTitle: z.string(),
});

export const quizResultsResponseSchema = z.object({
  quizId: objectIdSchema,
  title: z.string(),
  allowRetake: z.boolean(),
  /** Resultado vigente = el del último intento completado. */
  current: z.object({
    attemptId: objectIdSchema,
    completedAt: z.string(),
    result: resultPayloadSchema,
  }),
  history: z.array(resultHistoryItemSchema),
});
export type QuizResultsResponse = z.infer<typeof quizResultsResponseSchema>;

export const resultsListQuerySchema = z.object({ bookId: objectIdSchema });
export const resultsListResponseSchema = z.object({
  results: z.array(
    z.object({
      quizId: objectIdSchema,
      title: z.string(),
      order: z.number().int(),
      attemptsCompleted: z.number().int().min(1),
      completedAt: z.string(),
      resultTitle: z.string(),
      media: mediaSchema.optional(),
    }),
  ),
});
export type ResultsListResponse = z.infer<typeof resultsListResponseSchema>;

// --- Progreso ---

export const experienceStatusSchema = z.enum(['locked', 'available', 'completed']);
export const progressQuerySchema = z.object({ bookId: objectIdSchema });
export const progressResponseSchema = z.object({
  bookId: objectIdSchema,
  experiences: z.array(
    z.object({
      kind: z.literal('quiz'),
      id: objectIdSchema,
      title: z.string(),
      order: z.number().int(),
      status: experienceStatusSchema,
      /** Por qué está bloqueado: falta completar el anterior (con su nombre) o aún no se escaneó su QR. */
      lockedBy: z
        .discriminatedUnion('reason', [
          z.object({ reason: z.literal('order'), waitingFor: z.string() }),
          z.object({ reason: z.literal('qr') }),
        ])
        .optional(),
      inProgress: z.boolean(),
      allowRetake: z.boolean(),
    }),
  ),
  /** Se fija al completar todos los quizzes y el juego (el juego llega en la fase 10). */
  bookCompleted: z.boolean(),
});
export type ProgressResponse = z.infer<typeof progressResponseSchema>;

// ---------------------------------------------------------------------------
// Administración (mínima en la fase 6; el editor completo llega en la fase 7)
// ---------------------------------------------------------------------------

export const quizIssueSchema = z.object({
  code: z.string(),
  /** Dónde está el problema, p. ej. `stages.etapa-1.questions.p3`. */
  path: z.string().optional(),
  message: z.string(),
});
export type QuizIssue = z.infer<typeof quizIssueSchema>;

export const quizValidationResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(quizIssueSchema),
  warnings: z.array(quizIssueSchema),
});
export type QuizValidationResponse = z.infer<typeof quizValidationResponseSchema>;

export const publishQuizResponseSchema = z.object({
  quizId: objectIdSchema,
  version: z.number().int().min(1),
  publishedAt: z.string(),
  warnings: z.array(quizIssueSchema),
});
export type PublishQuizResponse = z.infer<typeof publishQuizResponseSchema>;
