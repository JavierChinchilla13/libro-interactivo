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
