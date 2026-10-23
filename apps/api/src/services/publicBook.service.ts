import type { PublicBookDetail, PublicBookSummary } from '@libro/shared';
import { AppError } from '../lib/errors.js';
import { Book } from '../models/Book.js';
import { GameStory } from '../models/GameStory.js';
import { Quiz } from '../models/Quiz.js';
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
    ...(book.theme ? { theme: book.theme } : {}),
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
    const quizzes = await Quiz.find({ bookId: book._id, status: 'published' })
      .select('order')
      .sort({ order: 1 })
      .lean();
    const hasGame = await GameStory.exists({ bookId: book._id, status: 'published' });
    return {
      ...summaryOf(full),
      synopsis: full.synopsis,
      genres: full.genres,
      ...(full.contentWarning ? { contentWarning: full.contentWarning } : {}),
      ...(full.minAge !== undefined ? { minAge: full.minAge } : {}),
      ...(full.isbn ? { isbn: full.isbn } : {}),
      purchaseLinks: full.purchaseLinks,
      // Solo el rótulo de cada pestaña y si está bloqueada: el contenido y el quiz que la abre no salen de aquí.
      wikiTabs: [...full.wikiSections]
        .filter((section) => section.enabled)
        .sort((a, b) => a.order - b.order)
        .map((section) => ({
          kind: section.kind,
          title: section.title,
          locked: section.unlockAfter !== undefined,
          ...(section.unlockAfter && section.lockedMessage
            ? { lockedMessage: section.lockedMessage }
            : {}),
        })),
      // Solo el tipo y la posición de cada experiencia: ni títulos ni identificadores (privacidad; ver el esquema).
      experiences: [
        ...quizzes.map((quiz) => ({ kind: 'quiz' as const, order: quiz.order })),
        // El juego, si el libro lo tiene, va siempre al final.
        ...(hasGame
          ? [{ kind: 'game' as const, order: (quizzes[quizzes.length - 1]?.order ?? 0) + 1 }]
          : []),
      ],
    };
  }

  return { list, getBySlug };
}

export type PublicBookService = ReturnType<typeof createPublicBookService>;
