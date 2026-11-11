import {
  CARDS_SHOW_LOCKED,
  CARD_FOLDER,
  CARD_IMAGE_LIMITS,
  CARD_WIDTHS,
  type AdminCard,
  type CardInput,
  type CardReorderRequest,
  type ImageSignatureResponse,
  type ReaderCard,
  type ReaderCardsResponse,
  type Role,
} from '@libro/shared';
import type { Types } from 'mongoose';
import type { Clock } from '../lib/clock.js';
import { randomToken } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { cardImageUrl } from '../lib/images.js';
import { isDuplicateKey } from '../lib/mongoErrors.js';
import { Book } from '../models/Book.js';
import { Card } from '../models/Card.js';
import { UserProgress } from '../models/UserProgress.js';
import type { ImageProvider } from '../providers/images/ImageProvider.js';

type CardLean = NonNullable<Awaited<ReturnType<typeof findLean>>>;

async function findLean(id: string) {
  return Card.findById(id).lean();
}

const NOT_FOUND = 'No encontramos esa carta';

/** «1,2 MB» con coma decimal, como el resto de los mensajes del sitio. */
function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',');
}

function toAdmin(card: CardLean): AdminCard {
  return {
    id: card._id.toString(),
    bookId: card.bookId.toString(),
    title: card.title,
    ...(card.alt ? { alt: card.alt } : {}),
    order: card.order,
    status: card.status,
    image: {
      publicId: card.image.publicId,
      width: card.image.width,
      height: card.image.height,
      bytes: card.image.bytes,
      format: card.image.format,
      url: cardImageUrl(card.image.publicId, CARD_WIDTHS.thumb),
    },
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

export interface CardDeps {
  images: ImageProvider;
  clock: Clock;
  /** Solo para pruebas: por defecto `CARDS_SHOW_LOCKED`. */
  showLocked?: boolean;
}

/** Quién pide ver las cartas (sale de la sesión: el cliente nunca lo dice). */
export interface CardViewer {
  userId: string;
  role: Role;
}

/**
 * Cartas con QR. El panel (solo ADMIN) las crea con una imagen subida de forma firmada a Cloudinary; el servidor
 * genera el `public_id` (aleatorio, no adivinable) y verifica la imagen con Cloudinary antes de guardarla. La lectora
 * solo recibe las cartas que ya abrió con su QR, y la URL de la imagen sale únicamente de estas respuestas (siempre
 * con `Cache-Control: private, no-store`): nunca de listas públicas, `GET /books*`, el mapa del sitio ni otras pantallas.
 */
export function createCardService(deps: CardDeps) {
  const { images, clock } = deps;
  const showLocked = deps.showLocked ?? CARDS_SHOW_LOCKED;

  async function mustFind(id: string): Promise<CardLean> {
    const card = await findLean(id);
    if (!card) throw new AppError('NOT_FOUND', NOT_FOUND);
    return card;
  }

  async function assertBook(bookId: string): Promise<void> {
    if (!(await Book.exists({ _id: bookId })))
      throw new AppError('NOT_FOUND', 'No encontramos ese libro');
  }

  // ----- Panel (solo ADMIN) -----

  /** Firma la subida de una imagen de carta con un identificador nuevo que elige el servidor. */
  async function signUpload(bookId: string): Promise<ImageSignatureResponse> {
    await assertBook(bookId);
    const publicId = `${CARD_FOLDER}/${randomToken(18)}`;
    return images.signCardUpload({ publicId, timestamp: Math.floor(clock().getTime() / 1000) });
  }

  /** La imagen debe existir de verdad en Cloudinary y cumplir formato, peso y tamaño (lo medido es de Cloudinary). */
  async function inspectImage(publicId: string) {
    const info = await images.inspect({ publicId, resource: 'image' });
    if (!info)
      throw new AppError('VALIDATION', 'No encontramos esa imagen en Cloudinary: súbela de nuevo');
    if (info.bytes > CARD_IMAGE_LIMITS.maxBytes) {
      throw new AppError(
        'VALIDATION',
        `La imagen pesa ${megabytes(info.bytes)} MB; el máximo es ${CARD_IMAGE_LIMITS.maxBytes / (1024 * 1024)} MB`,
      );
    }
    const format = info.format === 'jpeg' ? 'jpg' : info.format;
    if (!(CARD_IMAGE_LIMITS.formats as readonly string[]).includes(format)) {
      throw new AppError('VALIDATION', 'La imagen debe ser JPG, PNG o WebP');
    }
    const shortSide = Math.min(info.width, info.height);
    const longSide = Math.max(info.width, info.height);
    if (shortSide < CARD_IMAGE_LIMITS.minSide) {
      throw new AppError(
        'VALIDATION',
        `La imagen es muy pequeña: debe medir al menos ${CARD_IMAGE_LIMITS.minSide} píxeles por lado`,
      );
    }
    if (longSide > CARD_IMAGE_LIMITS.maxSide) {
      throw new AppError(
        'VALIDATION',
        `La imagen es muy grande: no puede pasar de ${CARD_IMAGE_LIMITS.maxSide} píxeles por lado`,
      );
    }
    return { publicId, format, width: info.width, height: info.height, bytes: info.bytes };
  }

  function conflict(error: unknown): never {
    if (isDuplicateKey(error)) {
      throw new AppError('CONFLICT', 'Esa imagen ya está en otra carta: sube una nueva');
    }
    throw error;
  }

  async function list(bookId: string): Promise<AdminCard[]> {
    const cards = await Card.find({ bookId }).sort({ order: 1, createdAt: 1 }).lean();
    return cards.map(toAdmin);
  }

  async function get(id: string): Promise<AdminCard> {
    return toAdmin(await mustFind(id));
  }

  async function create(actorId: string, input: CardInput): Promise<AdminCard> {
    await assertBook(input.bookId);
    const image = await inspectImage(input.image.publicId);
    try {
      const card = await Card.create({
        bookId: input.bookId,
        title: input.title,
        ...(input.alt ? { alt: input.alt } : {}),
        order: input.order,
        status: input.status,
        image,
        createdBy: actorId,
      });
      return get(card._id.toString());
    } catch (error) {
      return conflict(error);
    }
  }

  /** Reemplaza la carta. Una imagen distinta se vuelve a verificar; la anterior queda en Cloudinary (el API nunca borra). */
  async function replace(id: string, input: CardInput): Promise<AdminCard> {
    const current = await mustFind(id);
    if (current.bookId.toString() !== input.bookId) {
      throw new AppError('VALIDATION', 'Una carta no se puede mover a otro libro');
    }
    const image =
      input.image.publicId === current.image.publicId
        ? {
            publicId: current.image.publicId,
            format: current.image.format,
            width: current.image.width,
            height: current.image.height,
            bytes: current.image.bytes,
          }
        : await inspectImage(input.image.publicId);
    try {
      await Card.updateOne(
        { _id: id },
        {
          $set: {
            title: input.title,
            order: input.order,
            status: input.status,
            image,
            ...(input.alt ? { alt: input.alt } : {}),
          },
          ...(input.alt ? {} : { $unset: { alt: 1 } }),
        },
      );
    } catch (error) {
      return conflict(error);
    }
    return get(id);
  }

  /** `ids` deben ser exactamente las cartas del libro (si alguien más cambió la lista, se pide recargar). */
  async function reorder(request: CardReorderRequest): Promise<AdminCard[]> {
    const current = await Card.find({ bookId: request.bookId }).select('_id').lean();
    const known = new Set(current.map((card) => card._id.toString()));
    const same =
      request.ids.length === known.size &&
      new Set(request.ids).size === known.size &&
      request.ids.every((id) => known.has(id));
    if (!same) {
      throw new AppError(
        'CONFLICT',
        'La lista de cartas cambió. Recarga la pantalla y vuelve a ordenar',
      );
    }
    await Card.bulkWrite(
      request.ids.map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { order: index + 1 } } },
      })),
    );
    return list(request.bookId);
  }

  // ----- Lectora -----

  /** Ids de las cartas que la persona abrió con su QR (siguen en la cuenta aunque el QR se revoque después). */
  async function openedIds(userId: string): Promise<Set<string>> {
    const docs = await UserProgress.find({ userId, 'unlocked.kind': 'card' })
      .select('unlocked')
      .lean();
    return new Set(
      docs.flatMap((doc) =>
        (doc.unlocked ?? []).filter((u) => u.kind === 'card').map((u) => u.refId.toString()),
      ),
    );
  }

  function toReader(
    card: {
      _id: Types.ObjectId;
      bookId: Types.ObjectId;
      title: string;
      alt?: string | null;
      image: CardLean['image'];
    },
    bookTitle: string,
    width: number,
  ): ReaderCard {
    return {
      id: card._id.toString(),
      bookId: card.bookId.toString(),
      bookTitle,
      title: card.title,
      alt: card.alt || card.title,
      imageUrl: cardImageUrl(card.image.publicId, width),
      width: card.image.width,
      height: card.image.height,
    };
  }

  /**
   * Las cartas de la lectora: SOLO las abiertas (de las demás no sale ni el título, ni la imagen, ni cuántas hay, salvo
   * que `CARDS_SHOW_LOCKED` se encienda). Una administradora ve todas las publicadas (modo prueba). Se archiva =
   * deja de verse; el libro debe estar publicado.
   */
  async function listForReader(viewer: CardViewer): Promise<ReaderCardsResponse> {
    const testMode = viewer.role === 'ADMIN';
    const opened = testMode ? new Set<string>() : await openedIds(viewer.userId);
    if (!testMode && opened.size === 0 && !showLocked) return { cards: [], testMode };

    const cards = await Card.find(
      testMode ? { status: 'published' } : { _id: { $in: [...opened] }, status: 'published' },
    ).lean();
    const bookIds = [...new Set(cards.map((card) => card.bookId.toString()))];
    const books = await Book.find(
      testMode ? { _id: { $in: bookIds } } : { _id: { $in: bookIds }, status: 'published' },
    )
      .select('title order')
      .lean();
    const byBook = new Map(books.map((book) => [book._id.toString(), book]));
    const visible = cards
      .filter((card) => byBook.has(card.bookId.toString()))
      .sort((a, b) => {
        const bookA = byBook.get(a.bookId.toString())?.order ?? 0;
        const bookB = byBook.get(b.bookId.toString())?.order ?? 0;
        return bookA - bookB || a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime();
      })
      .map((card) =>
        toReader(card, byBook.get(card.bookId.toString())?.title ?? '', CARD_WIDTHS.thumb),
      );

    if (showLocked && !testMode) {
      const publishedBooks = await Book.find({ status: 'published' }).select('_id').lean();
      const total = await Card.countDocuments({
        status: 'published',
        bookId: { $in: publishedBooks.map((book) => book._id) },
      });
      return { cards: visible, testMode, locked: Math.max(total - visible.length, 0) };
    }
    return { cards: visible, testMode };
  }

  /**
   * Una carta abierta, en grande. Se comprueba CADA vez: carta publicada, libro publicado y abierta por esta cuenta (o
   * administradora). Cualquier otro caso es el mismo 404, para no revelar qué cartas existen.
   */
  async function openForReader(viewer: CardViewer, cardId: string): Promise<ReaderCard> {
    const card = await findLean(cardId);
    if (!card || card.status !== 'published') throw new AppError('NOT_FOUND', NOT_FOUND);
    const book = await Book.findById(card.bookId).select('title status').lean();
    if (!book) throw new AppError('NOT_FOUND', NOT_FOUND);
    if (viewer.role !== 'ADMIN') {
      if (book.status !== 'published') throw new AppError('NOT_FOUND', NOT_FOUND);
      if (!(await openedIds(viewer.userId)).has(cardId)) throw new AppError('NOT_FOUND', NOT_FOUND);
    }
    return toReader(card, book.title, CARD_WIDTHS.large);
  }

  return { signUpload, list, get, create, replace, reorder, listForReader, openForReader };
}

export type CardService = ReturnType<typeof createCardService>;
