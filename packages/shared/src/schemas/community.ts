import { z } from 'zod';
import { httpUrlSchema, imageRefSchema, objectIdSchema } from './common.js';

/**
 * Comunidad: fan arts y reseñas. En la v1 **no hay envío público**: la autora (o
 * la editora) las carga desde el panel. Los fan arts solo se publican con el permiso del artista confirmado.
 */

// --- Fan arts ------------------------------------------------------------------------------------------------------

export const FAN_ART_STATUSES = ['draft', 'published', 'archived'] as const;
export const fanArtStatusSchema = z.enum(FAN_ART_STATUSES);
export type FanArtStatus = z.infer<typeof fanArtStatusSchema>;

export const fanArtInputSchema = z
  .object({
    /** Vacío = toda la saga. */
    bookId: objectIdSchema.optional(),
    title: z.string().trim().max(160).optional(),
    image: imageRefSchema,
    artistName: z
      .string({ error: 'Escribe el nombre del artista' })
      .trim()
      .min(1, 'Escribe el nombre del artista')
      .max(120),
    artistLink: httpUrlSchema.optional(),
    /** Obligatorio `true` para publicar. */
    permissionConfirmed: z.boolean().default(false),
    /** Cómo o cuándo se obtuvo el permiso. No es público. */
    permissionNote: z.string().trim().max(500).optional(),
    order: z.number().int().min(1).default(1),
    status: fanArtStatusSchema.default('draft'),
  })
  .refine((art) => art.status !== 'published' || art.permissionConfirmed, {
    path: ['permissionConfirmed'],
    message: 'No se puede publicar sin confirmar que el artista dio su permiso',
  });
export type FanArtInput = z.infer<typeof fanArtInputSchema>;
export type FanArtInputPayload = z.input<typeof fanArtInputSchema>;

/** Lo que ve el público: nada del permiso ni del estado. */
export const publicFanArtSchema = z.object({
  id: objectIdSchema,
  title: z.string().optional(),
  image: imageRefSchema,
  artistName: z.string(),
  artistLink: z.string().optional(),
  bookId: objectIdSchema.optional(),
  order: z.number().int(),
});
export type PublicFanArt = z.infer<typeof publicFanArtSchema>;

export const fanArtListQuerySchema = z.object({ bookId: objectIdSchema.optional() });
export const fanArtListResponseSchema = z.object({ fanArts: z.array(publicFanArtSchema) });

export const adminFanArtSchema = publicFanArtSchema.extend({
  permissionConfirmed: z.boolean(),
  permissionNote: z.string().optional(),
  status: fanArtStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminFanArt = z.infer<typeof adminFanArtSchema>;

export const adminFanArtListQuerySchema = z.object({
  status: fanArtStatusSchema.optional(),
  bookId: objectIdSchema.optional(),
});
export const adminFanArtListResponseSchema = z.object({ fanArts: z.array(adminFanArtSchema) });
export const adminFanArtParamsSchema = z.object({ fanArtId: objectIdSchema });

// --- Reseñas -------------------------------------------------------------------------------------------------------

export const REVIEW_STATUSES = ['published', 'hidden'] as const;
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const reviewInputSchema = z.object({
  /** Vacío = toda la saga. */
  bookId: objectIdSchema.optional(),
  /** Texto plano (no HTML). */
  text: z
    .string({ error: 'Escribe la reseña' })
    .trim()
    .min(1, 'Escribe la reseña')
    .max(1000, 'La reseña no puede superar los 1000 caracteres'),
  authorName: z
    .string({ error: 'Escribe el nombre del lector' })
    .trim()
    .min(1, 'Escribe el nombre del lector')
    .max(80),
  /** Dónde se publicó (opcional). */
  source: z.string().trim().max(120).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  order: z.number().int().min(1).default(1),
  status: reviewStatusSchema.default('published'),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;
export type ReviewInputPayload = z.input<typeof reviewInputSchema>;

export const publicReviewSchema = z.object({
  id: objectIdSchema,
  text: z.string(),
  authorName: z.string(),
  source: z.string().optional(),
  rating: z.number().int().optional(),
  bookId: objectIdSchema.optional(),
  order: z.number().int(),
});
export type PublicReview = z.infer<typeof publicReviewSchema>;

export const reviewListQuerySchema = z.object({
  bookId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(6),
});
export const reviewListResponseSchema = z.object({ reviews: z.array(publicReviewSchema) });

export const adminReviewSchema = publicReviewSchema.extend({
  status: reviewStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminReview = z.infer<typeof adminReviewSchema>;

export const adminReviewListQuerySchema = z.object({
  status: reviewStatusSchema.optional(),
  bookId: objectIdSchema.optional(),
});
export const adminReviewListResponseSchema = z.object({ reviews: z.array(adminReviewSchema) });
export const adminReviewParamsSchema = z.object({ reviewId: objectIdSchema });
