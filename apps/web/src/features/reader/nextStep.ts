import type { LibraryEntry } from './LibraryBookCard';

/** Ruta del siguiente paso de un libro abierto: el quiz, o el juego (que va por libro). */
export function nextHref(entry: LibraryEntry): string | undefined {
  const next = entry.progress?.nextExperience;
  if (!next) return undefined;
  return next.kind === 'game' ? `/panel/juego/${entry.book.id}` : `/panel/quiz/${next.id}`;
}
