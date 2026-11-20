import { Link } from 'react-router';

/**
 * Direcciones del lector REAL a las que lleva «Probar como lector» (modo prueba del equipo). Son las mismas pantallas que
 * ve un lector, con su apariencia, etapas, resultado y celebración: el servidor deja pasar al equipo (por el rol de la
 * sesión, en cada petición) sin QR, sin orden y también en libros sin publicar, y nada de lo probado cuenta.
 */
export const readerPaths = {
  quiz: (quizId: string) => `/panel/quiz/${quizId}`,
  /** El BORRADOR del quiz (solo equipo): las mismas pantallas, con una copia congelada de lo que hay en el borrador. */
  quizDraft: (quizId: string) => `/panel/quiz/${quizId}?fuente=borrador`,
  book: (slug: string) => `/panel/libros/${encodeURIComponent(slug)}`,
  extra: (extraId: string) => `/panel/extras/${extraId}`,
  card: (cardId: string) => `/panel/cartas/${cardId}`,
  wikiEntry: (entryId: string, bookSlug?: string) =>
    `/wiki/entrada/${entryId}${bookSlug ? `?libro=${encodeURIComponent(bookSlug)}` : ''}`,
};

/**
 * Botón que abre algo en el lector real. En los formularios se abre en otra pestaña (`newTab`) para no perder lo que
 * todavía no se guardó; en las listas, en la misma. En una lista (`compact`) el nombre del elemento va oculto para los
 * lectores de pantalla.
 */
export function TryAsReader({
  to,
  label = 'Probar como lector',
  name,
  compact = false,
  newTab = false,
  title,
  disabledReason,
}: {
  to: string;
  label?: string;
  name?: string;
  compact?: boolean;
  newTab?: boolean;
  title?: string;
  /** Si viene, el botón queda apagado y esto dice por qué (por ejemplo, hay cambios sin guardar). */
  disabledReason?: string;
}) {
  if (disabledReason) {
    return (
      <button
        type="button"
        disabled
        title={disabledReason}
        className={`btn btn-secondary ${compact ? 'btn-compact' : ''}`}
      >
        {label}
        {name ? <span className="sr-only"> {name}</span> : null}
        <span className="sr-only">. {disabledReason}</span>
      </button>
    );
  }
  return (
    <Link
      to={to}
      title={title}
      className={`btn btn-secondary ${compact ? 'btn-compact' : ''}`}
      {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {label}
      {name ? <span className="sr-only"> {name}</span> : null}
      {newTab ? <span className="sr-only"> (se abre en una pestaña nueva)</span> : null}
    </Link>
  );
}
