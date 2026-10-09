import type { PublicBookSummary } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { booksApi, readerKeys } from './api';

const STORAGE_KEY = 'libro_selected_book';

function remembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // sin almacenamiento (modo privado): se usa el primer libro
  }
}

/** Libros con contenido para jugar: los publicados (los «próximamente» todavía no tienen nada). */
export function playable(books: readonly PublicBookSummary[]): PublicBookSummary[] {
  return books.filter((book) => book.status === 'published');
}

/**
 * Libro con el que trabaja el panel del lector. Si la saga tiene varios, se recuerda el último elegido en este
 * navegador (solo una comodidad: no es dato de la cuenta).
 */
export function useSelectedBook() {
  const books = useQuery({ queryKey: readerKeys.books, queryFn: booksApi.list, staleTime: 60_000 });
  const [chosen, setChosen] = useState<string | null>(remembered);
  const list = playable(books.data?.books ?? []);
  const book = list.find((candidate) => candidate.id === chosen) ?? list[0];

  function select(id: string) {
    setChosen(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* no se pudo recordar: no pasa nada */
    }
  }

  return { books: list, book, select, isPending: books.isPending, error: books.error };
}
