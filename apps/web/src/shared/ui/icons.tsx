/**
 * Iconos propios del sitio: un solo trazo, `currentColor` (el estado lo da el color del texto) y decorativos
 * (`aria-hidden`): el significado siempre va también en texto.
 */
export function LockIcon({
  open = false,
  className = 'size-5',
}: {
  /** Candado abierto: lo que está disponible. */
  open?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d={open ? 'M8 11V8a4 4 0 0 1 7.5-2' : 'M8 11V8a4 4 0 0 1 8 0v3'} />
    </svg>
  );
}

/** Flecha hacia arriba y a la derecha: un enlace que abre fuera del sitio. */
export function ArrowUpRightIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

const STAR_PATH =
  'M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z';

/**
 * Valoración de 1 a 5 con estrellas dibujadas (SVG, no emoji) en el ámbar de `--token-warning`. Las estrellas son
 * decorativas; el significado va en texto («N de 5 estrellas») para lectores de pantalla.
 */
export function StarRating({ rating, className = '' }: { rating: number; className?: string }) {
  const value = Math.min(5, Math.max(1, Math.round(rating)));
  return (
    <p className={`flex items-center gap-2 text-sm ${className}`}>
      <span className="flex gap-0.5 text-warning" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <svg
            key={n}
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill={n <= value ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
            opacity={n <= value ? 1 : 0.4}
          >
            <path d={STAR_PATH} />
          </svg>
        ))}
      </span>
      <span className="sr-only">{value} de 5 estrellas</span>
    </p>
  );
}
