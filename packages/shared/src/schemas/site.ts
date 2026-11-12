import { z } from 'zod';
import { httpUrlSchema, imageRefSchema, objectIdSchema } from './common.js';
import {
  bookStatusSchema,
  bookThemeSchema,
  purchaseLinkSchema,
  wikiSectionKindSchema,
} from './book.js';

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

/** Frase principal y presentación de la landing («¿Qué es el universo Memorias?»). */
export const universeSettingsSchema = z.object({
  headline: z.string().trim().max(200).optional(),
  /** HTML: se sanea en el servidor al guardar. */
  introHtml: z.string().max(20_000),
  /** Pintura de fondo de todo el sitio (imagen de Cloudinary; sin ella se ve el color liso). */
  background: imageRefSchema.optional(),
  /** Imágenes de la rejilla inclinada bajo el titular: ninguna (no se muestra) o entre 5 y 9. */
  headerImages: z
    .array(imageRefSchema)
    .max(9, 'Máximo 9 imágenes')
    .refine((list) => list.length === 0 || list.length >= 5, 'Sube entre 5 y 9 imágenes, o ninguna')
    .optional(),
});
export type UniverseSettings = z.infer<typeof universeSettingsSchema>;

/** «Conoce a la autora». El correo es el que ella quiere mostrar; el de recepción de mensajes es privado. */
export const authorSettingsSchema = z.object({
  name: z.string().trim().max(120).optional(),
  /** HTML: se sanea en el servidor al guardar. */
  bioHtml: z.string().max(20_000),
  photo: imageRefSchema.optional(),
  publicEmail: z.email().max(254).optional(),
});
export type AuthorSettings = z.infer<typeof authorSettingsSchema>;

export const socialLinkSchema = z.object({
  label: z.string().trim().min(1, 'Escribe el nombre de la red').max(40),
  url: httpUrlSchema,
});
export type SocialLink = z.infer<typeof socialLinkSchema>;
export const socialLinksSchema = z.array(socialLinkSchema).max(8);

/** Texto que ve el visitante en lo que aún no puede abrir («Bloqueado: avanza en tu lectura»). */
export const lockSettingsSchema = z.object({ message: z.string().trim().max(200).optional() });
export type LockSettings = z.infer<typeof lockSettingsSchema>;

/**
 * Contacto (solo administradoras): correo privado donde llegan los mensajes, si se guardan en el panel y cuántos días.
 * `recipientEmail` vacío = se usa el configurado por el desarrollador (`CONTACT_RECIPIENT_EMAIL`).
 */
export const contactSettingsSchema = z.object({
  recipientEmail: z.email().max(254).optional(),
  storeMessages: z.boolean(),
  retentionDays: z.number().int().min(1).max(3650),
});
export type ContactSettings = z.infer<typeof contactSettingsSchema>;

/**
 * Nombre legal de la titular del sitio (persona física o empresa). Lo escribe una administradora en el panel y lo leen
 * la política de privacidad y los términos. Nunca se escribe en el código: el repositorio es público. Vacío = las
 * páginas legales muestran un dato pendiente.
 */
export const legalOwnerNameSchema = z
  .string()
  .trim()
  .max(160, 'El nombre legal no puede superar los 160 caracteres');

/**
 * Cómo se llama la sección de cartas (menú del panel de la lectora, títulos de sus pantallas y panel de administración).
 * Lo escribe una administradora; se guarda como texto plano (sin marcado). Vacío = el nombre por defecto. Los
 * identificadores internos (`cards`, `card`) no cambian.
 */
export const CARDS_LABEL_DEFAULT = 'Hallazgos';
export const CARDS_LABEL_MAX = 40;
export const cardsLabelSchema = z
  .string()
  .trim()
  .max(CARDS_LABEL_MAX, `El nombre no puede superar los ${CARDS_LABEL_MAX} caracteres`);

export const siteSettingsResponseSchema = z.object({
  welcome: welcomeSettingsSchema,
  universe: universeSettingsSchema,
  author: authorSettingsSchema,
  social: socialLinksSchema,
  lock: lockSettingsSchema,
  /** Solo la ven las administradoras. */
  contact: contactSettingsSchema.optional(),
  legalOwnerName: z.string().optional(),
  /** Nombre de la sección de cartas (siempre viene: el de la autora o «Hallazgos»). */
  cardsLabel: z.string().default(CARDS_LABEL_DEFAULT),
});
export type SiteSettingsResponse = z.infer<typeof siteSettingsResponseSchema>;

/** Panel (EDITOR o ADMIN): cada sección se guarda por separado; llega al menos una. */
export const updateSiteSettingsRequestSchema = z
  .object({
    welcome: welcomeSettingsSchema.optional(),
    universe: universeSettingsSchema.optional(),
    author: authorSettingsSchema.optional(),
    social: socialLinksSchema.optional(),
    lock: lockSettingsSchema.optional(),
    /** Solo administradoras (si la manda una editora, `403`). */
    contact: contactSettingsSchema.optional(),
    /** Solo administradoras (`403` para una editora). Vacío lo quita. */
    legalOwnerName: legalOwnerNameSchema.optional(),
    /** Solo administradoras (`403` para una editora). Vacío vuelve al nombre por defecto. */
    cardsLabel: cardsLabelSchema.optional(),
  })
  .refine((body) => Object.values(body).some((section) => section !== undefined), {
    message: 'No hay nada que guardar',
  });
export type UpdateSiteSettingsRequest = z.infer<typeof updateSiteSettingsRequestSchema>;

/** Lo que ve cualquier visitante de la landing (nunca el mensaje de bienvenida ni el correo de recepción). */
export const publicSiteResponseSchema = z.object({
  universe: universeSettingsSchema,
  author: authorSettingsSchema,
  social: socialLinksSchema,
  lockMessage: z.string(),
  /** Para la política de privacidad y los términos (ausente si aún no se escribió). */
  legalOwnerName: z.string().optional(),
  /** Nombre de la sección de cartas: lo usan el menú y los títulos del panel de la lectora. */
  cardsLabel: z.string().default(CARDS_LABEL_DEFAULT),
});
export type PublicSiteResponse = z.infer<typeof publicSiteResponseSchema>;

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
  /** Color primario y fondo del libro (la web los aplica solo si mantienen el contraste). */
  theme: bookThemeSchema.optional(),
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
  /**
   * Pestañas de la wiki activas. `locked` = la autora la bloqueó hasta cierto avance: se ve «bloqueada» con su
   * mensaje y **sin contenido**. El contenido real de las abiertas se pide aparte (wiki pública).
   */
  wikiTabs: z.array(
    z.object({
      kind: wikiSectionKindSchema,
      title: z.string(),
      locked: z.boolean(),
      lockedMessage: z.string().optional(),
    }),
  ),
  /**
   * Solo el tipo y la posición de cada experiencia publicada (cuántas hay y en qué orden): ni títulos ni identificadores.
   * Es igual para todo el mundo —por eso se puede guardar en caché compartida—; quien ya abrió el libro ve los títulos
   * de sus quizzes en su avance (`/me/progress`).
   */
  experiences: z.array(
    z.object({
      kind: z.enum(['quiz', 'game']),
      order: z.number().int(),
    }),
  ),
});
export type PublicBookDetail = z.infer<typeof publicBookDetailSchema>;

export const publicBookParamsSchema = z.object({ slug: z.string().min(1).max(80) });
