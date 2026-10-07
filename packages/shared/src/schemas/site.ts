import { z } from 'zod';
import { imageRefSchema, objectIdSchema } from './common.js';
import { bookStatusSchema, bookThemeSchema, purchaseLinkSchema } from './book.js';

/**
 * Mensaje de bienvenida que ve el lector al iniciar sesión (el «pacto» con el lector).
 * `every_login` (por defecto, pendiente de confirmar con la autora) o solo la primera vez.
 */
export const WELCOME_SHOW_MODES = ['first_login', 'every_login'] as const;

export const welcomeSettingsSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().max(120).optional(),
  /** HTML: se sanea en el servidor al guardar. */
  bodyHtml: z.string().max(20_000),
  showMode: z.enum(WELCOME_SHOW_MODES),
});
export type WelcomeSettings = z.infer<typeof welcomeSettingsSchema>;

export const siteSettingsResponseSchema = z.object({ welcome: welcomeSettingsSchema });
export type SiteSettingsResponse = z.infer<typeof siteSettingsResponseSchema>;

/** Panel (EDITOR o ADMIN): por ahora solo el mensaje de bienvenida; el resto de ajustes llega en la fase 11. */
export const updateSiteSettingsRequestSchema = z.object({ welcome: welcomeSettingsSchema });
export type UpdateSiteSettingsRequest = z.infer<typeof updateSiteSettingsRequestSchema>;

/** Lo que recibe el lector: si debe verlo ahora y su contenido. */
export const welcomeResponseSchema = z.discriminatedUnion('show', [
  z.object({ show: z.literal(false) }),
  z.object({ show: z.literal(true), title: z.string().optional(), bodyHtml: z.string() }),
]);
export type WelcomeResponse = z.infer<typeof welcomeResponseSchema>;

// --- Libros públicos (sin spoilers: nada de quizzes, wiki ni borradores) ---

export const publicBookSummarySchema = z.object({
  id: objectIdSchema,
  slug: z.string(),
  title: z.string(),
  tagline: z.string().optional(),
  cover: imageRefSchema.optional(),
  order: z.number().int(),
  /** `upcoming` = «Próximamente». */
  status: bookStatusSchema.extract(['published', 'upcoming']),
  releaseDate: z.string().optional(),
});
export type PublicBookSummary = z.infer<typeof publicBookSummarySchema>;

export const publicBookListResponseSchema = z.object({ books: z.array(publicBookSummarySchema) });

export const publicBookDetailSchema = publicBookSummarySchema.extend({
  synopsis: z.string(),
  genres: z.array(z.string()),
  contentWarning: z.string().optional(),
  minAge: z.number().int().optional(),
  isbn: z.string().optional(),
  purchaseLinks: z.array(purchaseLinkSchema),
  theme: bookThemeSchema.optional(),
});
export type PublicBookDetail = z.infer<typeof publicBookDetailSchema>;

export const publicBookParamsSchema = z.object({ slug: z.string().min(1).max(80) });
