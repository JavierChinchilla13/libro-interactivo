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
  type ReaderCardDetail,
  type ReaderCardsResponse,
  type Role,
} from '@libro/shared';
import type { Clock } from '../lib/clock.js';
import { randomToken } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { cardImageUrl } from '../lib/images.js';
import { isDuplicateKey } from '../lib/mongoErrors.js';
import { Book } from '../models/Book.js';
import { Card } from '../models/Card.js';
import { AccessToken } from '../models/AccessToken.js';
import { UserProgress } from '../models/UserProgress.js';
import type { Logger } from '../lib/logger.js';
import {
  auditDeletion,
  blockedError,
  notArchivedError,
  notDeletableError,
  type Noun,
} from './lifecycle.js';
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

/** Una imagen tal como se guarda (forma plana, sin los métodos de Mongoose). */
interface StoredImage {
  publicId: string;
  alt?: string | null | undefined;
  format: string;
  width: number;
  height: number;
  bytes: number;
}

function toAdmin(card: CardLean): AdminCard {
  return {
    id: card._id.toString(),
    bookId: card.bookId.toString(),
    title: card.title,
    order: card.order,
    status: card.status,
    images: card.images.map((image) => ({
      publicId: image.publicId,
      ...(image.alt ? { alt: image.alt } : {}),
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      format: image.format,
      url: cardImageUrl(image.publicId, CARD_WIDTHS.thumb),
    })),
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

/** Texto alternativo: el propio de la imagen o, si no hay, el título («Título, imagen 2 de 5» si son varias). */
function altOf(image: StoredImage, title: string, position: number, total: number): string {
  if (image.alt) return image.alt;
  return total > 1 ? `${title}, imagen ${position} de ${total}` : title;
}

export interface CardDeps {
  images: ImageProvider;
  clock: Clock;
  logger?: Logger;
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
 * genera el `public_id` (aleatorio, no adivinable) y verifica la imagen con Cloudinary antes de guardarla. El lector
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

  /** Firma la subida de UNA imagen de carta con un identificador nuevo que elige el servidor (una firma por imagen). */
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

  /**
   * Las imágenes de la carta, en el orden pedido y con sus medidas reales. Las que ya estaban guardadas no se vuelven a
   * consultar (cuida la cuota de Cloudinary); solo cambia su texto alternativo. Las nuevas se verifican todas.
   */
  async function resolveImages(
    wanted: CardInput['images'],
    stored: readonly StoredImage[] = [],
  ): Promise<StoredImage[]> {
    const known = new Map(stored.map((image) => [image.publicId, image]));
    const checked: StoredImage[] = [];
    for (const item of wanted) {
      const base = known.get(item.publicId) ?? (await inspectImage(item.publicId));
      checked.push({
        publicId: base.publicId,
        format: base.format,
        width: base.width,
        height: base.height,
        bytes: base.bytes,
        ...(item.alt ? { alt: item.alt } : {}),
      });
    }
    return checked;
  }

  async function create(actorId: string, input: CardInput): Promise<AdminCard> {
    await assertBook(input.bookId);
    const images = await resolveImages(input.images);
    try {
      const card = await Card.create({
        bookId: input.bookId,
        title: input.title,
        order: input.order,
        status: input.status,
        images,
        createdBy: actorId,
      });
      return get(card._id.toString());
    } catch (error) {
      return conflict(error);
    }
  }

  /** Reemplaza la carta. Una imagen nueva se verifica; las que se quitan quedan en Cloudinary (el API nunca borra). */
  async function replace(id: string, input: CardInput): Promise<AdminCard> {
    const current = await mustFind(id);
    if (current.bookId.toString() !== input.bookId) {
      throw new AppError('VALIDATION', 'Una carta no se puede mover a otro libro');
    }
    const images = await resolveImages(input.images, current.images);
    try {
      await Card.updateOne(
        { _id: id },
        { $set: { title: input.title, order: input.order, status: input.status, images } },
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

  // ----- Lector -----

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

  /** La lista solo entrega la primera imagen (portada): las demás URL salen al abrir la carta. */
  function toReader(card: CardLean, bookTitle: string): ReaderCard {
    const cover = card.images[0];
    if (!cover) throw new AppError('INTERNAL', 'La carta no tiene imágenes');
    return {
      id: card._id.toString(),
      bookId: card.bookId.toString(),
      bookTitle,
      title: card.title,
      alt: altOf(cover, card.title, 1, card.images.length),
      imageUrl: cardImageUrl(cover.publicId, CARD_WIDTHS.thumb),
      width: cover.width,
      height: cover.height,
      imageCount: card.images.length,
    };
  }

  function toDetail(card: CardLean, bookTitle: string): ReaderCardDetail {
    const total = card.images.length;
    return {
      id: card._id.toString(),
      bookId: card.bookId.toString(),
      bookTitle,
      title: card.title,
      images: card.images.map((image, index) => ({
        url: cardImageUrl(image.publicId, CARD_WIDTHS.large),
        alt: altOf(image, card.title, index + 1, total),
        width: image.width,
        height: image.height,
      })),
    };
  }

  /**
   * Las cartas del lector: SOLO las abiertas (de las demás no sale ni el título, ni la imagen, ni cuántas hay, salvo
   * que `CARDS_SHOW_LOCKED` se encienda). Un administrador ve todas las publicadas (modo prueba). Se archiva =
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
      .map((card) => toReader(card, byBook.get(card.bookId.toString())?.title ?? ''));

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
   * administrador). Cualquier otro caso es el mismo 404, para no revelar qué cartas existen.
   */
  async function openForReader(viewer: CardViewer, cardId: string): Promise<ReaderCardDetail> {
    const card = await findLean(cardId);
    if (!card || card.status !== 'published') throw new AppError('NOT_FOUND', NOT_FOUND);
    const book = await Book.findById(card.bookId).select('title status').lean();
    if (!book) throw new AppError('NOT_FOUND', NOT_FOUND);
    if (viewer.role !== 'ADMIN') {
      if (book.status !== 'published') throw new AppError('NOT_FOUND', NOT_FOUND);
      if (!(await openedIds(viewer.userId)).has(cardId)) throw new AppError('NOT_FOUND', NOT_FOUND);
    }
    return toDetail(card, book.title);
  }

  // --- Archivar, restaurar y eliminar (ver `lifecycle.ts`) -------------------------------------------------------

  const NOUN: Noun = { name: 'carta', feminine: true };

  /** Reversible: deja de verse y su QR deja de abrirla. */
  async function archive(id: string): Promise<AdminCard> {
    await mustFind(id);
    await Card.updateOne({ _id: id }, { $set: { status: 'archived' } });
    return get(id);
  }

  /** Una carta no tiene borrador: restaurar la vuelve a publicar (se abre otra vez con su QR). */
  async function restore(id: string): Promise<AdminCard> {
    const card = await mustFind(id);
    if (card.status !== 'archived') throw notArchivedError(NOUN);
    await Card.updateOne({ _id: id, status: 'archived' }, { $set: { status: 'published' } });
    return get(id);
  }

  /**
   * Definitivo. Solo una carta archivada, y nunca si ya la abrieron lectores (se les quitaría lo que tienen en su cuenta)
   * ni mientras su QR siga activo. No toca Cloudinary: las imágenes quedan para `cleanup:orphans` (que no limpia
   * `libro/cartas`). Los QR ya revocados de la carta se borran con ella.
   */
  async function remove(id: string, actorId: string): Promise<void> {
    const card = await mustFind(id);
    if (card.status !== 'archived') throw notDeletableError(NOUN, false);
    if (await UserProgress.exists({ unlocked: { $elemMatch: { kind: 'card', refId: id } } })) {
      throw blockedError(
        'Esta carta ya la abrieron lectores: eliminarla les quitaría lo que ya tienen en su cuenta. Déjala archivada (deja de verse y su QR deja de abrirla).',
      );
    }
    const target = { 'target.kind': 'card' as const, 'target.refId': id };
    if (await AccessToken.exists({ ...target, status: 'active' })) {
      throw blockedError(
        'Esta carta todavía tiene un código QR activo. Revócalo primero en «Códigos QR» y luego podrás eliminarla.',
      );
    }
    const result = await Card.deleteOne({ _id: id, status: 'archived' });
    if (result.deletedCount === 0) throw notDeletableError(NOUN, false);
    await AccessToken.deleteMany({ ...target, status: 'revoked' });
    auditDeletion(deps.logger, { entity: 'card', id, title: card.title, actorId });
  }

  return {
    signUpload,
    list,
    get,
    create,
    replace,
    reorder,
    listForReader,
    openForReader,
    archive,
    restore,
    remove,
  };
}

export type CardService = ReturnType<typeof createCardService>;
