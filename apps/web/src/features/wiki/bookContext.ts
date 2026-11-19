import { createContext, useContext } from 'react';

/**
 * Libro de la wiki que se está viendo (su dirección `?libro=`). Los enlaces a una ficha lo llevan para que la ficha y
 * sus relacionadas se pidan con ese libro como contexto (una entrada de toda la saga se rige por la pestaña de ese libro).
 */
export const WikiBookContext = createContext<string | null>(null);

/** Dirección de la ficha de una entrada, conservando el libro (`?libro=`) si se conoce. Los enlaces sin libro siguen valiendo. */
export function entryPath(entryId: string, bookSlug: string | null | undefined): string {
  return `/wiki/entrada/${entryId}${bookSlug ? `?libro=${encodeURIComponent(bookSlug)}` : ''}`;
}

export function useEntryPath(): (entryId: string) => string {
  const slug = useContext(WikiBookContext);
  return (entryId) => entryPath(entryId, slug);
}
