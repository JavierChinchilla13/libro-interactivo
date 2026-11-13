import { z } from 'zod';
import { objectIdSchema } from './common.js';

/**
 * Cartas con QR (ampliación fuera de la propuesta v2.0). Una carta es un título y de 1 a 12 imágenes (por ahora solo
 * imágenes: ni texto, ni video, ni PDF). Cada carta tiene su propio QR; se abre al escanearlo en cualquier momento (con
 * sesión) y queda guardada para siempre en la cuenta. Las no abiertas son secretas: el lector no ve ni sus imágenes,
 * ni su título, ni cuántas hay. Cómo se llama la sección lo decide la autora (`cardsLabel` en los ajustes del sitio);
 * los identificadores internos (`cards`, `card`) no cambian.
 */

/** Una carta archivada deja de verse para los lectores (y su QR deja de abrirla) hasta que se vuelva a publicar. */
export const CARD_STATUSES = ['published', 'archived'] as const;
export const cardStatusSchema = z.enum(CARD_STATUSES);
export type CardStatus = z.infer<typeof cardStatusSchema>;

/**
 * ¿«Cartas» muestra las no abiertas como «bloqueadas»? Hoy NO: no se muestran ni su número (son un secreto). Cambiarlo a
 * `true` hace que el API mande cuántas faltan (`locked`) y la pantalla las dibuje como cartas bloqueadas. Es el único
 * interruptor: nada más depende de esta decisión.
 */
export const CARDS_SHOW_LOCKED = false;

/** Carpeta de Cloudinary de las imágenes de cartas. El API nunca borra medios de aquí (misma regla que los fondos de quiz). */
export const CARD_FOLDER = 'libro/cartas';
/** El `public_id` lo genera el servidor: aleatorio y no adivinable (≥ 20 caracteres aleatorios). */
export const CARD_PUBLIC_ID_PATTERN = /^libro\/cartas\/[A-Za-z0-9_-]{20,64}$/;

/** Lo que se acepta de una imagen de carta (el servidor lo comprueba con Cloudinary, no con lo que diga el navegador). */
export const CARD_IMAGE_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  /** Formatos que devuelve Cloudinary (`jpeg` se informa como `jpg`). */
  formats: ['jpg', 'png', 'webp'],
  /** Lado menor y mayor, en píxeles: ni una miniatura borrosa ni una imagen descomunal. */
  minSide: 300,
  maxSide: 8000,
} as const;

/** Mínimo y máximo de imágenes de una carta (la autora las ordena; la primera es la portada de la lista). */
export const CARD_IMAGES = { min: 1, max: 12 } as const;

/** Ancho de entrega (px): miniatura de la cuadrícula y vista grande. Cloudinary entrega `f_auto,q_auto,c_limit`. */
export const CARD_WIDTHS = { thumb: 480, large: 1200 } as const;

export const cardTitleSchema = z.string().trim().min(1, 'Escribe el título de la carta').max(120);

/** Una imagen en el alta o la edición: se identifica por su `publicId` (lo demás lo mide el servidor). `alt` es opcional. */
export const cardImageInputSchema = z.object({
  publicId: z.string().regex(CARD_PUBLIC_ID_PATTERN, 'La imagen no es válida: súbela de nuevo'),
  alt: z.string().trim().max(300).optional(),
});
export type CardImageInput = z.infer<typeof cardImageInputSchema>;

/** Alta y edición de una carta. El orden de `images` es el que se ve (la primera es la portada). */
export const cardInputSchema = z.object({
  bookId: objectIdSchema,
  title: cardTitleSchema,
  order: z.number().int().min(1).max(9999).default(1),
  status: cardStatusSchema.default('published'),
  images: z
    .array(cardImageInputSchema)
    .min(CARD_IMAGES.min, 'Sube al menos una imagen')
    .max(CARD_IMAGES.max, `Una carta admite hasta ${CARD_IMAGES.max} imágenes`)
    .refine(
      (list) => new Set(list.map((item) => item.publicId)).size === list.length,
      'La misma imagen está repetida en la carta',
    ),
});
export type CardInput = z.infer<typeof cardInputSchema>;
export type CardInputPayload = z.input<typeof cardInputSchema>;

export const cardParamsSchema = z.object({ cardId: objectIdSchema });
export const cardListQuerySchema = z.object({ bookId: objectIdSchema });
export const cardUploadSignatureRequestSchema = z.object({ bookId: objectIdSchema });
export type CardUploadSignatureRequest = z.infer<typeof cardUploadSignatureRequestSchema>;

/** Reordenar las cartas de un libro: `ids` en el nuevo orden (se numeran 1..n). */
export const cardReorderRequestSchema = z.object({
  bookId: objectIdSchema,
  ids: z.array(objectIdSchema).min(1).max(500),
});
export type CardReorderRequest = z.infer<typeof cardReorderRequestSchema>;

/** Una carta para el panel de administración (solo ADMIN). */
export const adminCardSchema = z.object({
  id: objectIdSchema,
  bookId: objectIdSchema,
  title: z.string(),
  order: z.number().int(),
  status: cardStatusSchema,
  images: z.array(
    z.object({
      publicId: z.string(),
      alt: z.string().optional(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      bytes: z.number().int().nonnegative(),
      format: z.string(),
      /** Miniatura de entrega (nunca la imagen original). */
      url: z.string(),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminCard = z.infer<typeof adminCardSchema>;

export const adminCardListResponseSchema = z.object({ cards: z.array(adminCardSchema) });
export type AdminCardListResponse = z.infer<typeof adminCardListResponseSchema>;

/**
 * Una carta abierta en la lista del lector: título y SOLO la primera imagen (la portada). Las demás imágenes salen
 * únicamente al abrir la carta. Las URL solo salen del API tras validar sesión y que la carta esté abierta (o que sea
 * un administrador): es la ÚNICA forma de llegar a una imagen.
 */
export const readerCardSchema = z.object({
  id: objectIdSchema,
  bookId: objectIdSchema,
  bookTitle: z.string(),
  title: z.string(),
  /** El texto alternativo de la portada o, si no hay, el título. */
  alt: z.string(),
  imageUrl: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** Cuántas imágenes tiene (para indicar «5 imágenes» sin entregar sus URL). */
  imageCount: z.number().int().min(1),
});
export type ReaderCard = z.infer<typeof readerCardSchema>;

/** Una carta abierta en grande: todas sus imágenes, en el orden de la autora. */
export const readerCardDetailSchema = z.object({
  id: objectIdSchema,
  bookId: objectIdSchema,
  bookTitle: z.string(),
  title: z.string(),
  images: z
    .array(
      z.object({
        url: z.string(),
        /** El texto alternativo propio; si no hay, «Título, imagen 2 de 5» (o solo el título si es una). */
        alt: z.string(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    )
    .min(1),
});
export type ReaderCardDetail = z.infer<typeof readerCardDetailSchema>;

export const readerCardsResponseSchema = z.object({
  /** Orden: libros por su posición y, dentro de cada libro, el orden de la autora. */
  cards: z.array(readerCardSchema),
  /** `true` para un administrador: ve todas las publicadas (modo prueba), no solo las abiertas. */
  testMode: z.boolean(),
  /** Cuántas faltan por abrir. Solo viaja si `CARDS_SHOW_LOCKED` está encendido. */
  locked: z.number().int().nonnegative().optional(),
});
export type ReaderCardsResponse = z.infer<typeof readerCardsResponseSchema>;
