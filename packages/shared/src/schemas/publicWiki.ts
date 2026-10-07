import { z } from 'zod';
import { wikiSectionKindSchema } from './book.js';
import { imageRefSchema, objectIdSchema } from './common.js';
import { wikiKindSchema } from './wiki.js';

/**
 * Wiki pública (fase 9). El servidor decide **en cada petición** qué está abierto, bloqueado u oculto para quien
 * pregunta (con o sin sesión). Una entrada bloqueada se describe solo con `{ locked: true, id, kind, order }`: ni
 * nombre, ni imagen, ni slug.
 */

export const publicWikiSectionsQuerySchema = z.object({ bookId: objectIdSchema });

export const publicWikiSectionSchema = z.object({
  kind: wikiSectionKindSchema,
  title: z.string(),
  locked: z.boolean(),
  /** Solo si está bloqueada. */
  lockedMessage: z.string().optional(),
  /** Solo si está abierta: un bloqueo nunca entrega la introducción ni el mapa. */
  introHtml: z.string().optional(),
  mapImage: imageRefSchema.optional(),
});
export type PublicWikiSection = z.infer<typeof publicWikiSectionSchema>;

export const publicWikiSectionsResponseSchema = z.object({
  bookId: objectIdSchema,
  sections: z.array(publicWikiSectionSchema),
});
export type PublicWikiSectionsResponse = z.infer<typeof publicWikiSectionsResponseSchema>;

const lockedItemSchema = z.object({
  locked: z.literal(true),
  id: objectIdSchema,
  kind: wikiKindSchema,
  order: z.number().int(),
});

const openLeafSchema = z.object({
  locked: z.literal(false),
  id: objectIdSchema,
  kind: wikiKindSchema,
  slug: z.string(),
  name: z.string(),
  letter: z.string(),
  summary: z.string().optional(),
  image: imageRefSchema.optional(),
  group: z.string().optional(),
  order: z.number().int(),
});

/** Tarjeta de una entrada: abierta (datos de la tarjeta) o bloqueada (sin datos). */
export const publicWikiLeafSchema = z.discriminatedUnion('locked', [
  lockedItemSchema,
  openLeafSchema,
]);
export type PublicWikiLeaf = z.infer<typeof publicWikiLeafSchema>;

/** Igual que la tarjeta, y un campo de poder trae sus poderes (cada uno abierto o bloqueado). */
export const publicWikiItemSchema = z.discriminatedUnion('locked', [
  lockedItemSchema,
  openLeafSchema.extend({ powers: z.array(publicWikiLeafSchema).optional() }),
]);
export type PublicWikiItem = z.infer<typeof publicWikiItemSchema>;

export const publicWikiEntriesQuerySchema = z.object({
  bookId: objectIdSchema,
  kind: wikiSectionKindSchema,
  /** Buscar por nombre (sin distinguir acentos ni mayúsculas). */
  q: z.string().trim().min(1).max(80).optional(),
  /** Inicial: `A`–`Z` o `#`. */
  letter: z
    .string()
    .regex(/^[A-Z#]$/)
    .optional(),
});
export const publicWikiEntriesResponseSchema = z.object({ entries: z.array(publicWikiItemSchema) });
export type PublicWikiEntriesResponse = z.infer<typeof publicWikiEntriesResponseSchema>;

export const publicWikiEntryParamsSchema = z.object({ entryId: objectIdSchema });

export const publicWikiEntryResponseSchema = z.object({
  entry: z.object({
    id: objectIdSchema,
    kind: wikiKindSchema,
    slug: z.string(),
    name: z.string(),
    summary: z.string().optional(),
    /** HTML saneado en el servidor. */
    bodyHtml: z.string().optional(),
    image: imageRefSchema.optional(),
    group: z.string().optional(),
    fields: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  /** Entradas enlazadas: las bloqueadas llegan como tarjeta bloqueada y las ocultas no llegan. */
  related: z.array(publicWikiLeafSchema),
});
export type PublicWikiEntryResponse = z.infer<typeof publicWikiEntryResponseSchema>;
