import { z } from 'zod';
import { imageRefSchema, objectIdSchema, unlockRuleSchema } from './common.js';

/** Slug: minúsculas, números y guiones (sin acentos ni espacios). */
export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Usa minúsculas, números y guiones (sin acentos ni espacios)');

export const BOOK_STATUSES = ['draft', 'upcoming', 'published', 'archived'] as const;
export const bookStatusSchema = z.enum(BOOK_STATUSES);
export type BookStatus = z.infer<typeof bookStatusSchema>;

export const purchaseLinkSchema = z.object({
  region: z.enum(['CR', 'INTL']),
  kind: z.enum(['whatsapp', 'store', 'amazon', 'other']),
  label: z.string().min(1).max(80),
  /** Opcional: «compras presenciales en cada sede» no lleva enlace. */
  url: z.url().max(500).optional(),
  notes: z.string().max(300).optional(),
});
export type PurchaseLink = z.infer<typeof purchaseLinkSchema>;

/** Tipos de pestaña de la wiki que se pueden configurar por libro (los poderes viven dentro de su campo). */
export const WIKI_SECTION_KINDS = ['character', 'power_field', 'place', 'term'] as const;
export const wikiSectionKindSchema = z.enum(WIKI_SECTION_KINDS);

export const wikiSectionSchema = z.object({
  kind: wikiSectionKindSchema,
  title: z.string().min(1).max(60),
  order: z.number().int().min(1),
  enabled: z.boolean(),
  /** Bloquea toda la pestaña hasta completar este quiz (o el juego). */
  unlockAfter: unlockRuleSchema.optional(),
  lockedMessage: z.string().max(300).optional(),
  /** HTML sanitizado en el servidor al guardar. */
  introHtml: z.string().max(20_000).optional(),
  /** Solo en «lugares»: la imagen del mapa. */
  mapImage: imageRefSchema.optional(),
});
export type WikiSection = z.infer<typeof wikiSectionSchema>;

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Usa un color como #1a2b3c');

/** Tema por libro: color primario y fondo de color o de imagen (nunca video). */
export const bookThemeSchema = z.object({
  primaryColor: hexColorSchema.optional(),
  background: z.discriminatedUnion('type', [
    z.object({ type: z.literal('color'), color: hexColorSchema }),
    z.object({ type: z.literal('image'), image: imageRefSchema }),
  ]),
});
export type BookTheme = z.infer<typeof bookThemeSchema>;

/** Datos editables de un libro (crear y reemplazar). */
export const bookInputSchema = z
  .object({
    slug: slugSchema,
    title: z.string().min(1).max(160),
    tagline: z.string().max(200).optional(),
    /** HTML sanitizado en el servidor al guardar. */
    synopsis: z.string().max(20_000).default(''),
    genres: z.array(z.string().min(1).max(40)).max(10).default([]),
    /** HTML sanitizado: advertencia de contenido sensible. */
    contentWarning: z.string().max(5_000).optional(),
    minAge: z.number().int().min(0).max(99).optional(),
    isbn: z.string().max(20).optional(),
    cover: imageRefSchema.optional(),
    order: z.number().int().min(1),
    status: bookStatusSchema,
    /** Fecha de lanzamiento (AAAA-MM-DD). */
    releaseDate: z.iso.date().optional(),
    purchaseLinks: z.array(purchaseLinkSchema).max(12).default([]),
    wikiSections: z.array(wikiSectionSchema).max(8).default([]),
    theme: bookThemeSchema.optional(),
  })
  .superRefine((book, ctx) => {
    if ((book.status === 'published' || book.status === 'upcoming') && !book.cover) {
      ctx.addIssue({
        code: 'custom',
        path: ['cover'],
        message: 'Un libro publicado o «próximamente» necesita portada',
      });
    }
    const kinds = book.wikiSections.map((section) => section.kind);
    if (new Set(kinds).size !== kinds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['wikiSections'],
        message: 'Cada tipo de pestaña de la wiki solo puede configurarse una vez',
      });
    }
  });
export type BookInput = z.infer<typeof bookInputSchema>;
export type BookInputPayload = z.input<typeof bookInputSchema>;

export const bookResponseSchema = z.object({
  id: objectIdSchema,
  slug: z.string(),
  title: z.string(),
  tagline: z.string().optional(),
  synopsis: z.string(),
  genres: z.array(z.string()),
  contentWarning: z.string().optional(),
  minAge: z.number().int().optional(),
  isbn: z.string().optional(),
  cover: imageRefSchema.optional(),
  order: z.number().int(),
  status: bookStatusSchema,
  releaseDate: z.string().optional(),
  purchaseLinks: z.array(purchaseLinkSchema),
  wikiSections: z.array(wikiSectionSchema),
  theme: bookThemeSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BookResponse = z.infer<typeof bookResponseSchema>;

export const bookListResponseSchema = z.object({ books: z.array(bookResponseSchema) });
export const bookParamsSchema = z.object({ bookId: objectIdSchema });
