import { Link } from 'react-router';

/** El portal de luz de la identidad, en pequeño (mismo dibujo que el favicon). */
export function PortalIcon({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="14" fill="#06142b" />
      <rect x="19" y="9" width="26" height="46" rx="3" fill="#3fd8ff" opacity=".22" />
      <rect x="23" y="13" width="18" height="38" rx="2" fill="#3fd8ff" />
      <rect x="27" y="17" width="10" height="30" rx="1.5" fill="#e8f5ff" opacity=".9" />
    </svg>
  );
}

/** Marca del sitio: el portal y el nombre en serifa. */
export function Brand({ to = '/', label = 'Libro Interactivo' }: { to?: string; label?: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 font-display text-lg font-bold tracking-wide text-text"
    >
      <PortalIcon />
      <span>{label}</span>
    </Link>
  );
}
