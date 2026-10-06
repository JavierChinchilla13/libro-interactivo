import { z } from 'zod';
import { slugSchema } from './book.js';
import { imageRefSchema, objectIdSchema, unlockRuleSchema } from './common.js';

/** Tipos de entrada de la wiki unificada. */
export const WIKI_KINDS = ['character', 'power_field', 'power', 'place', 'term'] as const;
export const wikiKindSchema = z.enum(WIKI_KINDS);
export type WikiKind = z.infer<typeof wikiKindSchema>;

export const WIKI_STATUSES = ['draft', 'published', 'archived'] as const;
export const wikiStatusSchema = z.enum(WIKI_STATUSES);

/** Datos editables de una entrada de la wiki (crear y reemplazar). */
export const wikiEntryInputSchema = z.object({
  /** Vacío = toda la saga. */
  bookId: objectIdSchema.optional(),
  kind: wikiKindSchema,
  slug: slugSchema,
  name: z.string().min(1).max(120),
  summary: z.string().max(300).optional(),
  /** HTML sanitizado en el servidor al guardar. */
  bodyHtml: z.string().max(50_000).optional(),
  image: imageRefSchema.optional(),
  /** Subgrupo libre: tipo de lugar, rol del personaje… */
  group: z.string().min(1).max(80).optional(),
  fields: z
    .array(z.object({ label: z.string().min(1).max(60), value: z.string().min(1).max(300) }))
    .max(20)
    .default([]),
  /** Un poder cuelga de su campo (`power_field`). */
  parentId: objectIdSchema.optional(),
  /** Enlaces entre entradas (p. ej. un lugar → los personajes que lo usan). */
  links: z.array(objectIdSchema).max(50).default([]),
  unlockAfter: unlockRuleSchema.optional(),
  /** `show` (por defecto): bloqueada aparece como tarjeta «bloqueado»; `hide`: no aparece. */
  lockedDisplay: z.enum(['show', 'hide']).default('show'),
  order: z.number().int().min(1).default(1),
  status: wikiStatusSchema.default('draft'),
});
export type WikiEntryInput = z.infer<typeof wikiEntryInputSchema>;
export type WikiEntryInputPayload = z.input<typeof wikiEntryInputSchema>;

export const wikiEntryResponseSchema = z.object({
  id: objectIdSchema,
  bookId: objectIdSchema.optional(),
  kind: wikiKindSchema,
  slug: z.string(),
  name: z.string(),
  letter: z.string(),
  summary: z.string().optional(),
  bodyHtml: z.string().optional(),
  image: imageRefSchema.optional(),
  group: z.string().optional(),
  fields: z.array(z.object({ label: z.string(), value: z.string() })),
  parentId: objectIdSchema.optional(),
  links: z.array(objectIdSchema),
  unlockAfter: unlockRuleSchema.optional(),
  lockedDisplay: z.enum(['show', 'hide']),
  order: z.number().int(),
  status: wikiStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WikiEntryResponse = z.infer<typeof wikiEntryResponseSchema>;

export const wikiListQuerySchema = z.object({
  kind: wikiKindSchema.optional(),
  bookId: objectIdSchema.optional(),
  status: wikiStatusSchema.optional(),
  parentId: objectIdSchema.optional(),
  /** Buscar por nombre (sin distinguir acentos ni mayúsculas). */
  q: z.string().min(1).max(80).optional(),
  /** Filtrar por inicial: `A`–`Z` o `#`. */
  letter: z.string().regex(/^[A-Z#]$/).optional(),
});
export const wikiListResponseSchema = z.object({ entries: z.array(wikiEntryResponseSchema) });
export const wikiParamsSchema = z.object({ entryId: objectIdSchema });

/** Reordenar: `ids` en el nuevo orden (se numeran 1..n). Todas deben ser del mismo tipo (y libro). */
export const wikiReorderRequestSchema = z.object({
  kind: wikiKindSchema,
  bookId: objectIdSchema.optional(),
  ids: z.array(objectIdSchema).min(1).max(500),
});
export type WikiReorderRequest = z.infer<typeof wikiReorderRequestSchema>;
