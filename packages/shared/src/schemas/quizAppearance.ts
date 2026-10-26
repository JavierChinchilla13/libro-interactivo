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

/** Identificador de un fondo de quiz: la carpeta fija y un nombre simple (sin `..`, `?`, `#` ni barras extra). */
export const QUIZ_BG_PUBLIC_ID = /^libro\/quiz-bg\/[A-Za-z0-9_-]{1,120}$/;

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * ¿La URL de Cloudinary es exactamente de este `publicId`? La ruta debe ser `/<cuenta>/(image|video)/upload/` seguida
 * solo de transformaciones simples (`so_0,f_auto`, `c_limit,w_720`…) o de la versión (`v123`), el `publicId` y, a lo
 * sumo, una extensión. Así no pasan `fetch` remotos, `..` ni segmentos de más.
 */
export function urlHasPublicId(url: string, publicId: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.search || parsed.hash) return false;
    const pattern = new RegExp(
      `^/[^/]+/(?:image|video)/upload/(?:(?:[a-z]{1,3}_[A-Za-z0-9:,._-]*|v\\d+)/)*${escapeRegex(publicId)}(?:\\.[A-Za-z0-9]+)?$`,
    );
    return pattern.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** Cuántos estados anteriores se conservan para revertir. */
export const APPEARANCE_HISTORY_LIMIT = 10;

/**
 * Color de acento: un `#RRGGBB` libre. Solo se pinta en títulos grandes, bordes y controles (nunca en texto corrido) y
 * el lector lo aclara lo mínimo, al pintarlo, hasta que se lea (3:1) sobre el fondo ya velado: la garantía de
 * legibilidad es del cliente porque el servidor no ve píxeles. Se guarda siempre en minúsculas.
 */
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX_COLOR.test(value);

/**
 * Los acentos que antes eran nombres de token (lista cerrada) y su color en la paleta de esa época. Se siguen leyendo:
 * al parsear se convierten en su `#RRGGBB` y al guardar queda el hex.
 */
export const LEGACY_ACCENT_HEX = {
  primary: '#3fd8ff',
  accent: '#a89bff',
  success: '#5fe3ae',
  warning: '#ffcb66',
} as const;

/** Colores rápidos del editor (opcionales): los cuatro de siempre y dos más. */
export const QUICK_ACCENTS = [
  { name: 'Cian', hex: LEGACY_ACCENT_HEX.primary },
  { name: 'Lavanda', hex: LEGACY_ACCENT_HEX.accent },
  { name: 'Verde', hex: LEGACY_ACCENT_HEX.success },
  { name: 'Ámbar', hex: LEGACY_ACCENT_HEX.warning },
  { name: 'Rosa', hex: '#ff8fb1' },
  { name: 'Marfil', hex: '#f2ead8' },
] as const;

export const appearanceAccentSchema = z.preprocess(
  (value) =>
    typeof value === 'string' && value in LEGACY_ACCENT_HEX
      ? LEGACY_ACCENT_HEX[value as keyof typeof LEGACY_ACCENT_HEX]
      : value,
  z
    .string()
    .regex(HEX_COLOR, 'El color debe ser un código #RRGGBB')
    .transform((value) => value.toLowerCase()),
);
export type AppearanceAccent = string;

/** La lista blanca exacta: lo único que se puede cambiar en vivo. */
export const APPEARANCE_FIELDS = [
  'background',
  'overlay',
  'accent',
  'cover',
  'introHtml',
  'questions',
] as const;
export type AppearanceField = (typeof APPEARANCE_FIELDS)[number];

const altSchema = z.string().trim().min(1, 'Escribe un texto alternativo').max(200);

const backgroundPublicIdSchema = z
  .string()
  .regex(QUIZ_BG_PUBLIC_ID, 'El fondo debe subirse desde la pestaña Apariencia del quiz');

export const backgroundImageSchema = imageRefSchema.extend({
  publicId: backgroundPublicIdSchema,
  url: z.string().min(1).max(2048),
  alt: altSchema,
});

/** Video corto de fondo: póster y texto alternativo obligatorios, duración acotada. */
export const backgroundVideoSchema = z.object({
  provider: z.literal('cloudinary'),
  publicId: backgroundPublicIdSchema,
  url: z.string().min(1).max(2048),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
  durationSeconds: z
    .number()
    .positive()
    .max(
      QUIZ_VIDEO_LIMITS.maxDurationSeconds + QUIZ_VIDEO_LIMITS.toleranceSeconds,
      `El video no puede durar más de ${QUIZ_VIDEO_LIMITS.maxDurationSeconds} segundos`,
    ),
  posterUrl: z.string().min(1, 'El video necesita un póster').max(2048),
  alt: altSchema,
});
export type BackgroundVideo = z.infer<typeof backgroundVideoSchema>;

export const quizBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('image'), image: backgroundImageSchema }),
  z.object({ kind: z.literal('video'), video: backgroundVideoSchema }),
]);
export type QuizBackground = z.infer<typeof quizBackgroundSchema>;

/**
 * Topes del bloque de apariencia (constantes fáciles de cambiar): cuidan el peso de la página y los créditos de
 * Cloudinary. Un video general cuenta como un video.
 */
export const APPEARANCE_LIMITS = {
  /** Preguntas con ajustes propios (de cualquier tipo). */
  maxCustomQuestions: 60,
  /** Preguntas con un fondo propio (imagen o video; uno por pregunta). */
  maxQuestionMedia: 5,
  /** Videos en todo el quiz (el general más los de las preguntas). */
  maxVideos: 4,
  /** Tamaño del bloque guardado (el historial conserva 10 estados anteriores). */
  maxBytes: 100 * 1024,
} as const;

/** El `id` estable de una pregunta (mismo formato que `quizIdSchema`; no se importa para no crear un ciclo). */
const questionIdKey = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'Id de pregunta no válido');

/** Fondo de una pregunta: lo del general, una imagen, un video o «ninguno» (quita el fondo solo en esa pregunta). */
export const questionBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('image'), image: backgroundImageSchema }),
  z.object({ kind: z.literal('video'), video: backgroundVideoSchema }),
  z.object({ kind: z.literal('none') }),
]);
export type QuestionBackground = z.infer<typeof questionBackgroundSchema>;

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

/**
 * Ajustes de UNA pregunta. Cada campo ausente significa «usar el general». Es solo decoración: nunca contiene
 * nada que dependa del resultado.
 */
export const questionAppearanceSchema = z
  .object({
    background: questionBackgroundSchema.optional(),
    overlay: quizOverlaySchema.optional(),
    accent: appearanceAccentSchema.optional(),
  })
  .strict();
export type QuestionAppearance = z.infer<typeof questionAppearanceSchema>;

export const quizAppearanceSchema = z
  .object({
    background: quizBackgroundSchema.optional(),
    overlay: quizOverlaySchema.default(DEFAULT_OVERLAY),
    accent: appearanceAccentSchema.optional(),
    /** Portada del quiz: solo se pinta en la introducción. */
    cover: imageRefSchema.optional(),
    /** Texto de introducción (HTML saneado en el servidor): ambientación, nunca reglas de puntaje ni pistas. */
    introHtml: z.string().max(5000).optional(),
    /** Ajustes propios de algunas preguntas, por el `id` estable de la pregunta (nunca por su posición). */
    questions: z.record(questionIdKey, questionAppearanceSchema).optional(),
  })
  .strict()
  .superRefine((appearance, ctx) => {
    const entries = Object.values(appearance.questions ?? {});
    const limits = APPEARANCE_LIMITS;
    const fail = (message: string) =>
      ctx.addIssue({ code: 'custom', path: ['questions'], message });
    if (entries.length > limits.maxCustomQuestions) {
      fail(`Como máximo ${limits.maxCustomQuestions} preguntas pueden tener ajustes propios`);
    }
    const withMedia = entries.filter(
      (entry) => entry.background && entry.background.kind !== 'none',
    );
    if (withMedia.length > limits.maxQuestionMedia) {
      fail(
        `Como máximo ${limits.maxQuestionMedia} preguntas pueden tener un fondo propio (imagen o video)`,
      );
    }
    const videos =
      (appearance.background?.kind === 'video' ? 1 : 0) +
      entries.filter((entry) => entry.background?.kind === 'video').length;
    if (videos > limits.maxVideos) {
      fail(`El quiz puede tener como máximo ${limits.maxVideos} videos de fondo en total`);
    }
    if (new TextEncoder().encode(JSON.stringify(appearance)).length > limits.maxBytes) {
      fail(
        `La apariencia ocupa demasiado (máximo ${limits.maxBytes / 1024} KB): quita ajustes de preguntas`,
      );
    }
  });
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

/** Lo que recibe la lectora junto a cada pregunta de la etapa (solo fondo, velo y acento; nunca el resultado). */
export const readerQuestionAppearanceSchema = questionAppearanceSchema;
export type ReaderQuestionAppearance = z.infer<typeof readerQuestionAppearanceSchema>;

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
