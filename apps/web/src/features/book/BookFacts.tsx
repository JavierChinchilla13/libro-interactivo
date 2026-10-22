import type { PublicBookDetail } from '@libro/shared';
import { SafeHtml } from '../../shared/ui/SafeHtml';

/** Géneros del libro, en una línea. Sin géneros no se pinta nada. */
export function BookGenres({ genres }: { genres: readonly string[] }) {
  if (genres.length === 0) return null;
  return (
    <ul aria-label="Géneros" className="flex flex-wrap gap-x-6 gap-y-1">
      {genres.map((genre) => (
        <li key={genre} className="label">
          {genre}
        </li>
      ))}
    </ul>
  );
}

/**
 * Los datos que acompañan al libro dondequiera que se muestre (la tarjeta de la portada y su página): la advertencia
 * de contenido sensible con la edad recomendada, y el ISBN. La advertencia es información de seguridad: no se pierde
 * al pasar de la tarjeta a la página.
 */
export function BookFacts({
  book,
}: {
  book: Pick<PublicBookDetail, 'contentWarning' | 'minAge' | 'isbn'>;
}) {
  return (
    <>
      {book.contentWarning || book.minAge !== undefined ? (
        <aside
          aria-label="Advertencia de contenido sensible"
          className="border-l-2 border-warning pl-4 text-sm"
        >
          <p className="font-semibold text-warning">Advertencia de contenido sensible</p>
          {book.contentWarning ? <SafeHtml html={book.contentWarning} /> : null}
          {book.minAge !== undefined ? (
            <p className="mt-1">Recomendado para mayores de {book.minAge} años.</p>
          ) : null}
        </aside>
      ) : null}
      {book.isbn ? <p className="text-sm text-muted">ISBN: {book.isbn}</p> : null}
    </>
  );
}
