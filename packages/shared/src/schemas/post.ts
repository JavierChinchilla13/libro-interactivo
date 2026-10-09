import { z } from 'zod';
import { slugSchema } from './book.js';
import { httpUrlSchema, imageRefSchema, objectIdSchema } from './common.js';

/**
 * Actualizaciones (posts) con plantillas. Cada publicación elige una plantilla y guarda
 * sus datos propios en `data`. **Agregar una plantilla = un esquema aquí + un componente en la web + un formulario
 * en el panel; la base de datos no cambia.**
 */

export const POST_TEMPLATES = [
  'text',
  'featured_image',
  'gallery',
  'event',
  'invitation',
  'announcement',
] as const;
export const postTemplateSchema = z.enum(POST_TEMPLATES);
export type PostTemplate = z.infer<typeof postTemplateSchema>;

/** Lo que filtra el lector: «Eventos», «Novedades», «Invitaciones». */
export const POST_CATEGORIES = ['novedad', 'evento', 'invitacion'] as const;
export const postCategorySchema = z.enum(POST_CATEGORIES);
export type PostCategory = z.infer<typeof postCategorySchema>;

export const POST_CATEGORY_LABELS: Record<PostCategory, string> = {
  novedad: 'Novedad',
  evento: 'Evento',
  invitacion: 'Invitación',
};

export const POST_STATUSES = ['draft', 'published', 'archived'] as const;
export const postStatusSchema = z.enum(POST_STATUSES);
export type PostStatus = z.infer<typeof postStatusSchema>;

// --- Datos propios de cada plantilla -------------------------------------------------------------------------------

const html = z.string().max(50_000);
const isoDate = z.iso.datetime({ error: 'Elige una fecha y hora válidas' });
const caption = z.string().trim().max(200).optional();

/** Texto obligatorio con aviso claro tanto si falta como si está vacío. */
const needHtml = (message: string) => z.string({ error: message }).min(1, message).max(50_000);
/** Imagen obligatoria: si falta, el aviso es este (y si está, debe ser una imagen válida). */
const needImage = (message: string) =>
  z
    .unknown()
    .refine((value) => value !== undefined, { error: message })
    .pipe(imageRefSchema);

const textBase = z.object({ bodyHtml: needHtml('Escribe el texto') });

const featuredImageBase = z.object({
  image: needImage('Sube la imagen destacada'),
  caption,
  bodyHtml: html.default(''),
});

const galleryBase = z.object({
  images: z
    .array(z.object({ image: imageRefSchema, caption }), { error: 'Agrega al menos una foto' })
    .min(1, 'Agrega al menos una foto')
    .max(40),
  bodyHtml: html.optional(),
});

const eventBase = z.object({
  startsAt: z.iso.datetime({ error: 'Elige la fecha y hora de inicio' }),
  endsAt: isoDate.optional(),
  venue: z.string({ error: 'Escribe el lugar' }).trim().min(1, 'Escribe el lugar').max(160),
  address: z.string().trim().max(300).optional(),
  mapUrl: httpUrlSchema.optional(),
  link: httpUrlSchema.optional(),
  bodyHtml: html.default(''),
});

const invitationBase = z.object({
  bodyHtml: needHtml('Escribe el texto de la invitación'),
  image: imageRefSchema.optional(),
  ctaLabel: z.string().trim().max(60).optional(),
  ctaUrl: httpUrlSchema.optional(),
  deadline: isoDate.optional(),
});

/** El anuncio no guarda el id del contenido anunciado: así no se filtra el título de un extra aún cerrado. */
export const ANNOUNCES = ['extra', 'book'] as const;
const announcementBase = z.object({
  announces: z.enum(ANNOUNCES, { error: 'Elige qué se anuncia' }),
  image: imageRefSchema.optional(),
  ctaLabel: z.string().trim().max(60).optional(),
  bodyHtml: html.optional(),
});

const strictEvent = eventBase.refine((e) => !e.endsAt || e.endsAt >= e.startsAt, {
  path: ['endsAt'],
  message: 'El evento no puede terminar antes de empezar',
});
const strictInvitation = invitationBase.refine((i) => Boolean(i.ctaLabel) === Boolean(i.ctaUrl), {
  path: ['ctaUrl'],
  message: 'El botón necesita su texto y su enlace (o ninguno de los dos)',
});

export interface PostTemplateDef {
  label: string;
  description: string;
  /** Tipo que se propone al elegir la plantilla (la autora puede cambiarlo). */
  defaultCategory: PostCategory;
  /** Campos con HTML enriquecido: el servidor los sanea al guardar. */
  htmlFields: readonly string[];
  /** Para publicar: todo lo obligatorio presente. */
  strict: z.ZodType;
  /** Para borradores: pueden estar incompletos. */
  draft: z.ZodType;
}

export const postTemplates = {
  text: {
    label: 'Texto simple',
    description: 'Título y texto',
    defaultCategory: 'novedad',
    htmlFields: ['bodyHtml'],
    strict: textBase,
    draft: textBase.partial(),
  },
  featured_image: {
    label: 'Imagen destacada',
    description: 'Imagen grande + texto',
    defaultCategory: 'novedad',
    htmlFields: ['bodyHtml'],
    strict: featuredImageBase,
    draft: featuredImageBase.partial(),
  },
  gallery: {
    label: 'Galería',
    description: 'Varias fotos',
    defaultCategory: 'novedad',
    htmlFields: ['bodyHtml'],
    strict: galleryBase,
    draft: galleryBase.partial(),
  },
  event: {
    label: 'Evento',
    description: 'Fecha, lugar y enlace',
    defaultCategory: 'evento',
    htmlFields: ['bodyHtml'],
    strict: strictEvent,
    draft: eventBase.partial(),
  },
  invitation: {
    label: 'Invitación',
    description: 'Texto + botón',
    defaultCategory: 'invitacion',
    htmlFields: ['bodyHtml'],
    strict: strictInvitation,
    draft: invitationBase.partial(),
  },
  announcement: {
    label: 'Anuncio de contenido',
    description: 'Capítulo extra o libro nuevo',
    defaultCategory: 'novedad',
    htmlFields: ['bodyHtml'],
    strict: announcementBase,
    draft: announcementBase.partial(),
  },
} as const satisfies Record<PostTemplate, PostTemplateDef>;

/** Valida los datos de una plantilla: completos para publicar, flexibles para un borrador. */
export function parsePostData(template: PostTemplate, data: unknown, publishing: boolean) {
  const def = postTemplates[template];
  return (publishing ? def.strict : def.draft).safeParse(data);
}

// --- Entrada del panel -----------------------------------------------------------------------------------------------

export const postInputSchema = z
  .object({
    /** Vacío = toda la saga. */
    bookId: objectIdSchema.optional(),
    slug: slugSchema,
    title: z.string().trim().min(1, 'Escribe el título').max(160),
    template: postTemplateSchema,
    /** Se valida contra el esquema de `template`. */
    data: z.record(z.string(), z.unknown()).default({}),
    /** Si falta, se toma de la plantilla. */
    category: postCategorySchema.optional(),
    /** Miniatura de la tarjeta; si falta se toma de la primera imagen de `data`. */
    thumbnail: imageRefSchema.optional(),
    status: postStatusSchema.default('draft'),
    /** Programable: una fecha futura la deja sin mostrar hasta entonces. */
    publishedAt: isoDate.optional(),
    featured: z.boolean().default(false),
  })
  .superRefine((post, ctx) => {
    const result = parsePostData(post.template, post.data, post.status === 'published');
    if (result.success) return;
    for (const issue of result.error.issues) {
      ctx.addIssue({ code: 'custom', path: ['data', ...issue.path], message: issue.message });
    }
  });
export type PostInput = z.infer<typeof postInputSchema>;
export type PostInputPayload = z.input<typeof postInputSchema>;

// --- Respuestas ------------------------------------------------------------------------------------------------------

/** Tarjeta de la lista pública y de la landing. */
export const postCardSchema = z.object({
  id: objectIdSchema,
  slug: z.string(),
  title: z.string(),
  template: postTemplateSchema,
  category: postCategorySchema,
  thumbnail: imageRefSchema.optional(),
  /** Primer párrafo en texto plano. */
  excerpt: z.string(),
  publishedAt: z.string(),
  eventAt: z.string().optional(),
  featured: z.boolean(),
  bookId: objectIdSchema.optional(),
});
export type PostCard = z.infer<typeof postCardSchema>;

export const postListQuerySchema = z.object({
  category: postCategorySchema.optional(),
  bookId: objectIdSchema.optional(),
  featured: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(9),
});
export type PostListQuery = z.infer<typeof postListQuerySchema>;

export const postListResponseSchema = z.object({
  posts: z.array(postCardSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type PostListResponse = z.infer<typeof postListResponseSchema>;

export const postSlugParamsSchema = z.object({ slug: slugSchema });

export const postDetailSchema = postCardSchema.extend({ data: z.record(z.string(), z.unknown()) });
export type PostDetail = z.infer<typeof postDetailSchema>;

export const adminPostSchema = postDetailSchema.omit({ publishedAt: true }).extend({
  /** Un borrador puede no tener fecha todavía. */
  publishedAt: isoDate.optional(),
  status: postStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminPost = z.infer<typeof adminPostSchema>;

export const adminPostListQuerySchema = z.object({
  status: postStatusSchema.optional(),
  category: postCategorySchema.optional(),
  q: z.string().trim().min(1).max(80).optional(),
});
export const adminPostListResponseSchema = z.object({ posts: z.array(adminPostSchema) });
export const adminPostParamsSchema = z.object({ postId: objectIdSchema });

/** Todas las imágenes (`ImageRef`) que hay dentro de los datos de una plantilla, en cualquier nivel. */
export function collectPostImages(value: unknown): z.infer<typeof imageRefSchema>[] {
  const found: z.infer<typeof imageRefSchema>[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node !== null && typeof node === 'object') {
      const image = imageRefSchema.safeParse(node);
      if (image.success) found.push(image.data);
      else Object.values(node).forEach(walk);
    }
  };
  walk(value);
  return found;
}

// Tipos de los datos de cada plantilla (en un borrador cualquier campo puede faltar: usar `Partial`).
export type TextPostData = z.infer<typeof textBase>;
export type FeaturedImagePostData = z.infer<typeof featuredImageBase>;
export type GalleryPostData = z.infer<typeof galleryBase>;
export type EventPostData = z.infer<typeof eventBase>;
export type InvitationPostData = z.infer<typeof invitationBase>;
export type AnnouncementPostData = z.infer<typeof announcementBase>;
