import type { PublicBookSummary } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { booksApi, readerKeys } from './api';
import { setSelectedBookId, useSelectedBookId } from './bookSelection';

export { setSelectedBookId };

/** Libros con contenido para jugar: los publicados (los «próximamente» todavía no tienen nada). */
export function playable(books: readonly PublicBookSummary[]): PublicBookSummary[] {
  return books.filter((book) => book.status === 'published');
}

/**
 * Qué libro se usa cuando la persona no ha elegido uno: `first` (el de menor orden: el del panel y la wiki) o
 * `featured` (el de mayor orden: el destacado de la portada).
 */
export type BookFallback = 'first' | 'featured';

/** Un único criterio de «libro activo»: el elegido en este navegador (si sigue publicado) y, si no, el de respaldo. */
export function pickBook(
  books: readonly PublicBookSummary[],
  chosen: string | null,
  fallback: BookFallback,
): PublicBookSummary | undefined {
  const list = playable(books);
  const ordered = [...list].sort((a, b) =>
    fallback === 'featured' ? b.order - a.order : a.order - b.order,
  );
  return list.find((book) => book.id === chosen) ?? ordered[0];
}

/**
 * Libro con el que trabaja el panel del lector. Si la saga tiene varios, se recuerda el último elegido en este
 * navegador (solo una comodidad: no es dato de la cuenta).
 */
export function useSelectedBook() {
  const books = useQuery({ queryKey: readerKeys.books, queryFn: booksApi.list, staleTime: 60_000 });
  const chosen = useSelectedBookId();
  const list = playable(books.data?.books ?? []);
  const book = pickBook(list, chosen, 'first');
  return {
    books: list,
    book,
    select: setSelectedBookId,
    isPending: books.isPending,
    error: books.error,
  };
}
