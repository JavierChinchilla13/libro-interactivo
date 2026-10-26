import { Link } from 'react-router';

/** Marca del sitio: el nombre en serifa (el logo definitivo llega con la identidad de la autora). */
export function Brand({ to = '/', label = 'Universo Memorias' }: { to?: string; label?: string }) {
  return (
    <Link
      viewTransition
      to={to}
      className="flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap font-display text-lg font-bold tracking-wide text-text"
    >
      <span>{label}</span>
    </Link>
  );
}
