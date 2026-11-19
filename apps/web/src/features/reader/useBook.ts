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
 * Libros que muestra la WIKI: los publicados y los «próximamente» (la wiki es pública y los mismos libros que lista el
 * sitio). Es una función aparte a propósito: el panel del lector, los quizzes y el juego siguen con `playable`, que solo
 * deja los publicados (un «próximamente» todavía no tiene nada que jugar).
 */
export function wikiBooks(books: readonly PublicBookSummary[]): PublicBookSummary[] {
  return books.filter((book) => book.status === 'published' || book.status === 'upcoming');
}

/**
 * Libro de la wiki: el de la dirección (`?libro=<slug>`, para compartir el enlace), si no el elegido en este navegador
 * y, si no, el de menor orden.
 */
export function pickWikiBook(
  books: readonly PublicBookSummary[],
  chosen: string | null,
  slug: string | null,
): PublicBookSummary | undefined {
  const list = wikiBooks(books);
  const ordered = [...list].sort((a, b) => a.order - b.order);
  return (
    (slug ? list.find((book) => book.slug === slug) : undefined) ??
    list.find((book) => book.id === chosen) ??
    ordered[0]
  );
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

/** Libros de la wiki (ordenados) y el que se está viendo. Solo lo usa la wiki. */
export function useWikiBook(slug: string | null) {
  const books = useQuery({ queryKey: readerKeys.books, queryFn: booksApi.list, staleTime: 60_000 });
  const chosen = useSelectedBookId();
  const all = books.data?.books ?? [];
  return {
    books: wikiBooks(all).sort((a, b) => a.order - b.order),
    book: pickWikiBook(all, chosen, slug),
    isPending: books.isPending,
    error: books.error,
  };
}

/**
 * Libro con el que trabaja el panel del lector. Si la saga tiene varios, se recuerda el último elegido en este
 * navegador (solo una comodidad: no es dato de la cuenta).
 */
export function useSelectedBook(slug?: string) {
  const books = useQuery({ queryKey: readerKeys.books, queryFn: booksApi.list, staleTime: 60_000 });
  const chosen = useSelectedBookId();
  const list = playable(books.data?.books ?? []);
  // En una dirección de un libro (`/panel/libros/:slug/…`) manda el de la dirección, no el recordado.
  const book =
    slug === undefined
      ? pickBook(list, chosen, 'first')
      : list.find((candidate) => candidate.slug === slug);
  return {
    books: list,
    book,
    select: setSelectedBookId,
    isPending: books.isPending,
    error: books.error,
  };
}
