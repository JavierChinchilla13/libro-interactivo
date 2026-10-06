import type { BookInput, BookResponse, ImageRef, WikiSection } from '@libro/shared';
import { assertCloudinaryUrls } from '../lib/images.js';
import { AppError } from '../lib/errors.js';
import { duplicateKeyFields, isDuplicateKey } from '../lib/mongoErrors.js';
import { sanitizeRichHtml } from '../lib/sanitize.js';
import { Book } from '../models/Book.js';
import { Quiz } from '../models/Quiz.js';

type BookLean = Awaited<ReturnType<typeof loadLean>>;

async function loadLean(id: string) {
  return Book.findById(id).lean();
}

export function toBookResponse(book: NonNullable<BookLean>): BookResponse {
  return {
    id: book._id.toString(),
    slug: book.slug,
    title: book.title,
    ...(book.tagline ? { tagline: book.tagline } : {}),
    synopsis: book.synopsis ?? '',
    genres: book.genres ?? [],
    ...(book.contentWarning ? { contentWarning: book.contentWarning } : {}),
    ...(book.minAge !== undefined && book.minAge !== null ? { minAge: book.minAge } : {}),
    ...(book.isbn ? { isbn: book.isbn } : {}),
    ...(book.cover ? { cover: book.cover as ImageRef } : {}),
    order: book.order,
    status: book.status,
    ...(book.releaseDate ? { releaseDate: book.releaseDate.toISOString().slice(0, 10) } : {}),
    purchaseLinks: (book.purchaseLinks ?? []) as BookResponse['purchaseLinks'],
    wikiSections: (book.wikiSections ?? []) as WikiSection[],
    ...(book.theme ? { theme: book.theme as BookResponse['theme'] } : {}),
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}

/** Libros (panel). Se archivan en lugar de borrarse: un libro con contenido y progreso no desaparece. */
export function createBookService() {
  /** Comprueba que las reglas de bloqueo apunten a quizzes de ESTE libro. */
  async function assertUnlockRules(bookId: string | undefined, sections: readonly WikiSection[]) {
    for (const section of sections) {
      const rule = section.unlockAfter;
      if (!rule || rule.kind !== 'quiz') continue;
      const exists = bookId ? await Quiz.exists({ _id: rule.refId, bookId }) : null;
      if (!exists) {
        throw new AppError(
          'VALIDATION',
          `El bloqueo de «${section.title}» debe apuntar a un quiz de este libro`,
        );
      }
    }
  }

  /** Aplica las reglas de escritura comunes a crear y reemplazar. */
  async function prepare(input: BookInput, bookId?: string) {
    assertCloudinaryUrls([
      input.cover?.url,
      input.theme?.background.type === 'image' ? input.theme.background.image.url : undefined,
      ...input.wikiSections.map((section) => section.mapImage?.url),
    ]);
    await assertUnlockRules(bookId, input.wikiSections);
    return {
      slug: input.slug,
      title: input.title,
      tagline: input.tagline,
      synopsis: sanitizeRichHtml(input.synopsis),
      genres: input.genres,
      contentWarning:
        input.contentWarning === undefined ? undefined : sanitizeRichHtml(input.contentWarning),
      minAge: input.minAge,
      isbn: input.isbn,
      cover: input.cover,
      order: input.order,
      status: input.status,
      releaseDate: input.releaseDate ? new Date(`${input.releaseDate}T00:00:00.000Z`) : undefined,
      purchaseLinks: input.purchaseLinks,
      wikiSections: input.wikiSections.map((section) => ({
        ...section,
        ...(section.introHtml === undefined ? {} : { introHtml: sanitizeRichHtml(section.introHtml) }),
      })),
      theme: input.theme,
    };
  }

  function conflict(error: unknown): never {
    if (isDuplicateKey(error) && duplicateKeyFields(error).includes('slug')) {
      throw new AppError('CONFLICT', 'Ya existe un libro con ese slug');
    }
    throw error;
  }

  async function list(): Promise<BookResponse[]> {
    const books = await Book.find().sort({ order: 1, createdAt: 1 }).lean();
    return books.map(toBookResponse);
  }

  async function get(id: string): Promise<BookResponse> {
    const book = await loadLean(id);
    if (!book) throw new AppError('NOT_FOUND', 'No encontramos ese libro');
    return toBookResponse(book);
  }

  async function create(input: BookInput): Promise<BookResponse> {
    const data = await prepare(input);
    try {
      const book = await Book.create(data);
      return get(book._id.toString());
    } catch (error) {
      return conflict(error);
    }
  }

  /** Reemplaza todos los datos editables del libro (el formulario del panel envía el libro completo). */
  async function replace(id: string, input: BookInput): Promise<BookResponse> {
    if (!(await Book.exists({ _id: id }))) throw new AppError('NOT_FOUND', 'No encontramos ese libro');
    const data = await prepare(input, id);
    const unset = Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => value === undefined)
        .map(([key]) => [key, 1]),
    );
    const set = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    try {
      await Book.updateOne({ _id: id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
    } catch (error) {
      return conflict(error);
    }
    return get(id);
  }

  return { list, get, create, replace };
}

export type BookService = ReturnType<typeof createBookService>;
