import { z } from 'zod';
import { imageRefSchema, objectIdSchema } from './common.js';

/**
 * Apariencia de un quiz: un bloque que vive en el documento del quiz FUERA de las versiones (`quizVersions`) y se edita
 * sin publicar una versión nueva (regla 5, excepción acotada). Solo contiene decoración: nada de lo que cambia el
 * significado de las preguntas o de los resultados. El esquema es `strict`: cualquier campo fuera de la lista blanca
 * (título, preguntas, reintentos, `resultKey`…) se rechaza en lugar de descartarse en silencio.
 */

/** Límites del video de fondo de un quiz (los usan el proveedor de subida, el editor y estos esquemas). */
export const QUIZ_VIDEO_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxDurationSeconds: 10,
  /** Cloudinary redondea la duración: se tolera un margen sobre el tope. */
  toleranceSeconds: 2,
  formats: ['mp4', 'webm'],
} as const;

/**
 * Intensidad de la capa de contraste. 0,78 es el piso que mantiene el texto en AA incluso sobre un píxel blanco: es el
 * mínimo del modo `manual`. Solo el modo `auto`, cuando el editor midió el fondo, puede bajar hasta `OVERLAY_MIN`.
 */
export const OVERLAY_MIN = 0.5;
export const OVERLAY_MAX = 0.92;
export const OVERLAY_FLOOR = 0.78;

/** Mínimo de intensidad que admite cada modo (el editor lo usa como tope inferior del control). */
export function overlayMinimum(mode: 'auto' | 'manual'): number {
  return mode === 'manual' ? OVERLAY_FLOOR : OVERLAY_MIN;
}

/** Número con coma decimal (así se escribe en español): `13,4`. Lo usan los mensajes del servidor y del editor. */
export function formatDecimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',');
}

/** Carpeta de Cloudinary de los fondos de quiz (propósito de subida `quiz-bg`). */
export const QUIZ_BG_FOLDER = 'libro/quiz-bg';

/** Póster de un video: su primer fotograma como JPG (`so_0`), con formato y calidad automáticos. */
export function videoPosterUrl(videoUrl: string): string {
  return videoUrl
    .replace('/video/upload/', '/video/upload/so_0,f_auto,q_auto/')
    .replace(/\.[A-Za-z0-9]+(\?.*)?$/, '.jpg');
}

/** ¿La URL de Cloudinary es de este `publicId` (con cualquier transformación y extensión)? */
export function urlHasPublicId(url: string, publicId: string): boolean {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    return path.endsWith(`/${publicId}`) || path.includes(`/${publicId}.`);
  } catch {
    return false;
  }
}

/** Cuántos estados anteriores se conservan para revertir. */
export const APPEARANCE_HISTORY_LIMIT = 10;

/** Colores de acento permitidos: solo tokens del sitio (nunca un color libre). */
export const APPEARANCE_ACCENTS = ['primary', 'accent', 'success', 'warning'] as const;
export const appearanceAccentSchema = z.enum(APPEARANCE_ACCENTS);
export type AppearanceAccent = z.infer<typeof appearanceAccentSchema>;

/** La lista blanca exacta: lo único que se puede cambiar en vivo. */
export const APPEARANCE_FIELDS = ['background', 'overlay', 'accent', 'cover', 'introHtml'] as const;
export type AppearanceField = (typeof APPEARANCE_FIELDS)[number];

const altSchema = z.string().trim().min(1, 'Escribe un texto alternativo').max(200);

export const backgroundImageSchema = imageRefSchema.extend({ alt: altSchema });

/** Video corto de fondo: póster y texto alternativo obligatorios, duración acotada. */
export const backgroundVideoSchema = z.object({
  provider: z.literal('cloudinary'),
  publicId: z.string().min(1),
  url: z.string().min(1),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
  durationSeconds: z
    .number()
    .positive()
    .max(
      QUIZ_VIDEO_LIMITS.maxDurationSeconds + QUIZ_VIDEO_LIMITS.toleranceSeconds,
      `El video no puede durar más de ${QUIZ_VIDEO_LIMITS.maxDurationSeconds} segundos`,
    ),
  posterUrl: z.string().min(1, 'El video necesita un póster'),
  alt: altSchema,
});
export type BackgroundVideo = z.infer<typeof backgroundVideoSchema>;

export const quizBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('image'), image: backgroundImageSchema }),
  z.object({ kind: z.literal('video'), video: backgroundVideoSchema }),
]);
export type QuizBackground = z.infer<typeof quizBackgroundSchema>;

export const quizOverlaySchema = z
  .object({
    /** `auto`: el editor midió el fondo y calculó la intensidad mínima que cumple AA; `manual`: la eligió la autora. */
    mode: z.enum(['auto', 'manual']).default('auto'),
    strength: z.number().min(OVERLAY_MIN).max(OVERLAY_MAX).default(OVERLAY_FLOOR),
  })
  .superRefine((overlay, ctx) => {
    // Sin medición no hay garantía de contraste: el modo manual no baja del piso.
    if (overlay.mode === 'manual' && overlay.strength < OVERLAY_FLOOR) {
      ctx.addIssue({
        code: 'custom',
        path: ['strength'],
        message: `En modo manual la intensidad no puede ser menor que ${OVERLAY_FLOOR}`,
      });
    }
  });
export type QuizOverlay = z.infer<typeof quizOverlaySchema>;

const DEFAULT_OVERLAY = { mode: 'auto', strength: OVERLAY_FLOOR } as const;

export const quizAppearanceSchema = z
  .object({
    background: quizBackgroundSchema.optional(),
    overlay: quizOverlaySchema.default(DEFAULT_OVERLAY),
    accent: appearanceAccentSchema.optional(),
    /** Portada del quiz: solo se pinta en la introducción. */
    cover: imageRefSchema.optional(),
    /** Texto de introducción (HTML saneado en el servidor): ambientación, nunca reglas de puntaje ni pistas. */
    introHtml: z.string().max(5000).optional(),
  })
  .strict();
export type QuizAppearance = z.infer<typeof quizAppearanceSchema>;
export type QuizAppearanceInput = z.input<typeof quizAppearanceSchema>;

/** Lo que recibe la lectora en la introducción: el fondo, el velo y el acento (portada e introducción ya viajan aparte). */
export const readerAppearanceSchema = z
  .object({
    background: quizBackgroundSchema.optional(),
    overlay: quizOverlaySchema.default(DEFAULT_OVERLAY),
    accent: appearanceAccentSchema.optional(),
  })
  .strict();
export type ReaderAppearance = z.infer<typeof readerAppearanceSchema>;

// --- Edición (panel: EDITOR o ADMIN) ---

export const updateQuizAppearanceRequestSchema = z.object({
  appearance: quizAppearanceSchema,
  /** Revisión que la persona vio al cargar: si cambió, el servidor responde 409 (otra persona editó). */
  expectedRev: z.number().int().min(0),
});
export type UpdateQuizAppearanceRequest = z.input<typeof updateQuizAppearanceRequestSchema>;

export const revertQuizAppearanceRequestSchema = z.object({
  /** Revisión cuyo estado ANTERIOR se restaura. */
  rev: z.number().int().min(1),
  expectedRev: z.number().int().min(0),
});
export type RevertQuizAppearanceRequest = z.infer<typeof revertQuizAppearanceRequestSchema>;

export const appearanceHistoryEntrySchema = z.object({
  rev: z.number().int().min(1),
  at: z.string(),
  /** `name: null` si la cuenta ya no existe. */
  by: z.object({ id: objectIdSchema, name: z.string().nullable() }),
  action: z.enum(['update', 'revert', 'seed']),
  /** Claves de la lista blanca que cambiaron. */
  changed: z.array(z.enum(APPEARANCE_FIELDS)),
});
export type AppearanceHistoryEntry = z.infer<typeof appearanceHistoryEntrySchema>;

/** Solo el historial (sin el bloque de apariencia): para pintar la lista de cambios y sus «Volver a este estado». */
export const quizAppearanceHistoryResponseSchema = z.object({
  rev: z.number().int().min(0),
  history: z.array(appearanceHistoryEntrySchema).max(APPEARANCE_HISTORY_LIMIT),
});
export type QuizAppearanceHistoryResponse = z.infer<typeof quizAppearanceHistoryResponseSchema>;

export const quizAppearanceResponseSchema = z.object({
  appearance: quizAppearanceSchema.nullable(),
  rev: z.number().int().min(0),
  history: z.array(appearanceHistoryEntrySchema).max(APPEARANCE_HISTORY_LIMIT),
  /** Avisos que no bloquean (por ejemplo, un texto que nombra un resultado). */
  warnings: z.array(z.enum(['APPEARANCE_MENTIONS_RESULT'])).default([]),
});
export type QuizAppearanceResponse = z.infer<typeof quizAppearanceResponseSchema>;
