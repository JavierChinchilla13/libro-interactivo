import { z } from 'zod';
import { slugSchema } from './book.js';
import { objectIdSchema } from './common.js';

/**
 * Capítulos y documentos extra. No tienen QR: se abren cuando la persona completó todos los
 * quizzes (y el juego, si el libro lo tiene). Los archivos viven en almacenamiento PRIVADO y se entregan con URL firmada.
 */
export const EXTRA_KINDS = ['pdf', 'text', 'image'] as const;
export const extraKindSchema = z.enum(EXTRA_KINDS);
export type ExtraKind = z.infer<typeof extraKindSchema>;

export const EXTRA_STATUSES = ['draft', 'published', 'archived'] as const;
export const extraStatusSchema = z.enum(EXTRA_STATUSES);

/** Tipos de archivo permitidos y su tamaño máximo (bytes). */
export const EXTRA_FILE_RULES = {
  pdf: { mimes: ['application/pdf'], maxBytes: 25 * 1024 * 1024 },
  image: { mimes: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 10 * 1024 * 1024 },
} as const;

export const extraFileSchema = z.object({
  storageKey: z.string().min(1).max(300),
  mime: z.string().min(1).max(100),
  size: z.number().int().positive(),
  originalName: z.string().min(1).max(200),
});
export type ExtraFile = z.infer<typeof extraFileSchema>;

export const extraInputSchema = z
  .object({
    bookId: objectIdSchema,
    slug: slugSchema,
    title: z.string().min(1).max(160),
    description: z.string().max(500).optional(),
    kind: extraKindSchema,
    file: extraFileSchema.optional(),
    /** HTML: se sanea en el servidor al guardar. */
    bodyHtml: z.string().max(200_000).optional(),
    order: z.number().int().min(1).default(1),
    status: extraStatusSchema.default('draft'),
  })
  .superRefine((extra, ctx) => {
    if (extra.kind === 'text') {
      if (!extra.bodyHtml?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['bodyHtml'],
          message: 'Escribe el texto del capítulo',
        });
      }
    } else if (!extra.file) {
      ctx.addIssue({ code: 'custom', path: ['file'], message: 'Sube el archivo' });
    }
  });
export type ExtraInput = z.infer<typeof extraInputSchema>;
export type ExtraInputPayload = z.input<typeof extraInputSchema>;

export const extraResponseSchema = z.object({
  id: objectIdSchema,
  bookId: objectIdSchema,
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  kind: extraKindSchema,
  file: extraFileSchema.optional(),
  bodyHtml: z.string().optional(),
  order: z.number().int(),
  status: extraStatusSchema,
  publishedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ExtraResponse = z.infer<typeof extraResponseSchema>;

export const extraListQuerySchema = z.object({ bookId: objectIdSchema });
export const extraListResponseSchema = z.object({ extras: z.array(extraResponseSchema) });
export const extraParamsSchema = z.object({ extraId: objectIdSchema });

/** Pedir permiso para subir un archivo directo al almacenamiento privado. */
export const extraUploadUrlRequestSchema = z.object({
  bookId: objectIdSchema,
  kind: z.enum(['pdf', 'image']),
  filename: z.string().min(1).max(200),
  mime: z.string().min(1).max(100),
  size: z.number().int().positive(),
});
export type ExtraUploadUrlRequest = z.infer<typeof extraUploadUrlRequestSchema>;

export const extraUploadUrlResponseSchema = z.object({
  /** Clave del objeto: va en `file.storageKey` al guardar el extra. */
  storageKey: z.string(),
  uploadUrl: z.string(),
  /** Cabeceras que el navegador debe enviar tal cual en el `PUT`. */
  headers: z.record(z.string(), z.string()),
  maxBytes: z.number().int().positive(),
  expiresIn: z.number().int().positive(),
});
export type ExtraUploadUrlResponse = z.infer<typeof extraUploadUrlResponseSchema>;

/** Vista previa para la autora (sin registrar «visto» ni exigir haber completado el libro). */
export type ExtraPreviewResponse = z.infer<typeof extraPreviewResponseSchema>;
export const extraPreviewResponseSchema = z.object({
  kind: extraKindSchema,
  title: z.string(),
  bodyHtml: z.string().optional(),
  url: z.string().optional(),
  mime: z.string().optional(),
  expiresIn: z.number().int().optional(),
});

// --- Lector ---

export const readerExtrasQuerySchema = z.object({ bookId: objectIdSchema });
/** Mientras el libro no esté completo solo se informa que está bloqueado (ni títulos ni cantidad). */
export const readerExtrasResponseSchema = z.discriminatedUnion('locked', [
  z.object({ locked: z.literal(true) }),
  z.object({
    locked: z.literal(false),
    extras: z.array(
      z.object({
        id: objectIdSchema,
        title: z.string(),
        description: z.string().optional(),
        kind: extraKindSchema,
        order: z.number().int(),
        /** Ya lo abrió alguna vez. */
        opened: z.boolean(),
      }),
    ),
  }),
]);
export type ReaderExtrasResponse = z.infer<typeof readerExtrasResponseSchema>;

export const readerExtraResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), title: z.string(), bodyHtml: z.string() }),
  z.object({
    kind: z.literal('pdf'),
    title: z.string(),
    url: z.string(),
    mime: z.string(),
    expiresIn: z.number().int(),
  }),
  z.object({
    kind: z.literal('image'),
    title: z.string(),
    url: z.string(),
    mime: z.string(),
    expiresIn: z.number().int(),
  }),
]);
export type ReaderExtraResponse = z.infer<typeof readerExtraResponseSchema>;
