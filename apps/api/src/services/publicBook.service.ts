import type { PublicBookDetail, PublicBookSummary } from '@libro/shared';
import { AppError } from '../lib/errors.js';
import { Book } from '../models/Book.js';
import { toBookResponse } from './book.service.js';

const VISIBLE: ('published' | 'upcoming')[] = ['published', 'upcoming'];

function summaryOf(book: ReturnType<typeof toBookResponse>): PublicBookSummary {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    ...(book.tagline ? { tagline: book.tagline } : {}),
    ...(book.cover ? { cover: book.cover } : {}),
    order: book.order,
    status: book.status === 'upcoming' ? 'upcoming' : 'published',
    ...(book.releaseDate ? { releaseDate: book.releaseDate } : {}),
  };
}

/** Libros visibles para todo el mundo: solo publicados y «próximamente». Nada de quizzes, wiki ni borradores. */
export function createPublicBookService() {
  async function list(): Promise<PublicBookSummary[]> {
    const books = await Book.find({ status: { $in: VISIBLE } })
      .sort({ order: 1 })
      .lean();
    return books.map((book) => summaryOf(toBookResponse(book)));
  }

  async function getBySlug(slug: string): Promise<PublicBookDetail> {
    const book = await Book.findOne({ slug, status: { $in: VISIBLE } }).lean();
    if (!book) throw new AppError('NOT_FOUND', 'No encontramos ese libro');
    const full = toBookResponse(book);
    return {
      ...summaryOf(full),
      synopsis: full.synopsis,
      genres: full.genres,
      ...(full.contentWarning ? { contentWarning: full.contentWarning } : {}),
      ...(full.minAge !== undefined ? { minAge: full.minAge } : {}),
      ...(full.isbn ? { isbn: full.isbn } : {}),
      purchaseLinks: full.purchaseLinks,
      ...(full.theme ? { theme: full.theme } : {}),
    };
  }

  return { list, getBySlug };
}

export type PublicBookService = ReturnType<typeof createPublicBookService>;
