import { z } from 'zod';
import { objectIdSchema } from './common.js';

/**
 * Cartas con QR (ampliación fuera de la propuesta v2.0). Una carta es un título y UNA imagen de frente. Cada carta tiene
 * su propio QR; se abre al escanearlo en cualquier momento (con sesión) y queda guardada para siempre en la cuenta.
 * Las cartas no abiertas son secretas: la lectora no ve ni su imagen, ni su título, ni cuántas hay.
 */

/** Una carta archivada deja de verse para las lectoras (y su QR deja de abrirla) hasta que se vuelva a publicar. */
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

/** Ancho de entrega (px): miniatura de la cuadrícula y vista grande. Cloudinary entrega `f_auto,q_auto,c_limit`. */
export const CARD_WIDTHS = { thumb: 480, large: 1200 } as const;

export const cardTitleSchema = z.string().trim().min(1, 'Escribe el título de la carta').max(120);

/** Alta y edición de una carta. La imagen se identifica por su `publicId`: lo demás lo mide el servidor. */
export const cardInputSchema = z.object({
  bookId: objectIdSchema,
  title: cardTitleSchema,
  /** Texto alternativo propio; si falta, el título. */
  alt: z.string().trim().max(300).optional(),
  order: z.number().int().min(1).max(9999).default(1),
  status: cardStatusSchema.default('published'),
  image: z.object({
    publicId: z.string().regex(CARD_PUBLIC_ID_PATTERN, 'La imagen no es válida: súbela de nuevo'),
  }),
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
  alt: z.string().optional(),
  order: z.number().int(),
  status: cardStatusSchema,
  image: z.object({
    publicId: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bytes: z.number().int().nonnegative(),
    format: z.string(),
    /** Miniatura de entrega (nunca la imagen original). */
    url: z.string(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminCard = z.infer<typeof adminCardSchema>;

export const adminCardListResponseSchema = z.object({ cards: z.array(adminCardSchema) });
export type AdminCardListResponse = z.infer<typeof adminCardListResponseSchema>;

/**
 * Una carta abierta, tal como la ve la lectora. Solo sale del API tras validar sesión y que la carta esté abierta
 * (o que sea una administradora): es la ÚNICA forma de llegar a la URL de la imagen.
 */
export const readerCardSchema = z.object({
  id: objectIdSchema,
  bookId: objectIdSchema,
  bookTitle: z.string(),
  title: z.string(),
  /** El texto alternativo propio o, si no hay, el título. */
  alt: z.string(),
  imageUrl: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ReaderCard = z.infer<typeof readerCardSchema>;

export const readerCardsResponseSchema = z.object({
  /** Orden: libros por su posición y, dentro de cada libro, el orden de la autora. */
  cards: z.array(readerCardSchema),
  /** `true` para una administradora: ve todas las publicadas (modo prueba), no solo las abiertas. */
  testMode: z.boolean(),
  /** Cuántas faltan por abrir. Solo viaja si `CARDS_SHOW_LOCKED` está encendido. */
  locked: z.number().int().nonnegative().optional(),
});
export type ReaderCardsResponse = z.infer<typeof readerCardsResponseSchema>;
