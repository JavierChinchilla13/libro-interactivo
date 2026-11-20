import type { PublicBookSummary, ReaderLibraryResponse } from '@libro/shared';
import { Book } from '../models/Book.js';
import { toBookResponse } from './book.service.js';
import { isStaff, type Actor, type ProgressService } from './progress.service.js';
import type { QuizService } from './quiz.service.js';

/**
 * «Tus libros» del panel: qué libros ve la persona y cómo. Publicados abiertos (con avance), publicados sin abrir
 * (bloqueados: solo portada y título, que ya son públicos) y «próximamente» solo si la autora los encendió para el
 * panel. Borrador y archivado nunca salen. **El equipo (modo prueba)** ve además los «próximamente» y los borradores, todos
 * abiertos y marcados `unpublished` (nunca los archivados). Nada protegido: ids, tipos y títulos que `/me/progress` ya entrega.
 */
export function createLibraryService(deps: { progress: ProgressService; quizzes: QuizService }) {
  const { progress, quizzes } = deps;

  async function getLibrary(actor: Actor): Promise<ReaderLibraryResponse> {
    // El rol sale de la sesión en cada petición: el equipo recorre también lo que un lector no ve.
    const staff = isStaff(actor.role);
    const books = await Book.find(
      staff
        ? { status: { $in: ['published', 'upcoming', 'draft'] } }
        : { $or: [{ status: 'published' }, { status: 'upcoming', showInReaderPanel: true }] },
    )
      .sort({ order: 1 })
      .lean();
    const published = books.filter((book) => staff || book.status === 'published');
    const opened = await progress.openedBooks(
      actor,
      published.map((book) => book._id.toString()),
    );
    const fields = await quizzes.latestFields(actor, [...opened]);

    const entries = await Promise.all(
      books.map(async (doc): Promise<ReaderLibraryResponse['books'][number]> => {
        const full = toBookResponse(doc);
        const book: PublicBookSummary = {
          id: full.id,
          slug: full.slug,
          title: full.title,
          ...(full.tagline ? { tagline: full.tagline } : {}),
          ...(full.cover ? { cover: full.cover } : {}),
          order: full.order,
          status: full.status === 'published' ? 'published' : 'upcoming',
          ...(full.releaseDate ? { releaseDate: full.releaseDate } : {}),
          ...(full.theme ? { theme: full.theme } : {}),
        };
        if (!staff && full.status === 'upcoming') return { book, access: 'upcoming' };
        if (!opened.has(full.id)) return { book, access: 'locked' };
        const state = await progress.getProgress(actor, full.id);
        // Solo el equipo recibe la marca: un lector nunca ve un libro sin publicar ni esta marca.
        const unpublished =
          staff && (full.status === 'upcoming' || full.status === 'draft')
            ? { unpublished: full.status }
            : {};
        const next = state.experiences.find((e) => e.status === 'available');
        const field = fields.get(full.id);
        return {
          book,
          access: 'open',
          ...unpublished,
          progress: {
            done: state.experiences.filter((e) => e.status === 'completed').length,
            total: state.experiences.length,
            ...(next
              ? { nextExperience: { kind: next.kind, id: next.id, title: next.title } }
              : {}),
            bookCompleted: state.bookCompleted,
          },
          ...(field ? { field } : {}),
        };
      }),
    );
    return { books: entries };
  }

  return { getLibrary };
}

export type LibraryService = ReturnType<typeof createLibraryService>;
