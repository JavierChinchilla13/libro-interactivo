/**
 * Iconos de la administración: un solo trazo (1.8), `currentColor` y decorativos (`aria-hidden`); el significado
 * siempre va también en texto. Set propio, sin dependencias: cada icono es el contenido de un SVG de 24×24.
 */
const PATHS = {
  home: <path d="M4 11.5 12 5l8 6.5M6.5 10v9h11v-9M10 19v-5h4v5" />,
  book: (
    <>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v13H6.5A1.5 1.5 0 0 0 5 18.5z" />
      <path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H19v-3" />
    </>
  ),
  quiz: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.6 9.5a2.4 2.4 0 1 1 3.4 2.2c-.7.4-1 .9-1 1.6M12 16.4v.1" />
    </>
  ),
  wiki: (
    <>
      <path d="M4 6.5C6.5 5 9.5 5 12 6.5v12c-2.5-1.5-5.5-1.5-8 0z" />
      <path d="M12 6.5c2.5-1.5 5.5-1.5 8 0v12c-2.5-1.5-5.5-1.5-8 0" />
    </>
  ),
  extra: (
    <>
      <path d="M7 4h8l3 3v13H7z" />
      <path d="M14.5 4v3.5H18M10 12h5M10 15.5h5" />
    </>
  ),
  news: (
    <>
      <path d="M5 5h11v14H7a2 2 0 0 1-2-2z" />
      <path d="M16 9h3v8a2 2 0 0 1-2 2M8 9h5M8 12.5h5" />
    </>
  ),
  art: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m5 17 4.5-4.5 3 3 2.5-2.5L19 17" />
    </>
  ),
  review: <path d="M12 4.2l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z" />,
  mail: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="m5 8 7 5 7-5" />
    </>
  ),
  cover: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 14h16M8 9.5h4" />
    </>
  ),
  hand: <path d="M12 19.5s-7-4.2-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.3c0 5-7 9.2-7 9.2z" />,
  contact: (
    <>
      <path d="M5 6.5h14v9H12l-4 3.5v-3.5H5z" />
      <path d="M9 10h6" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="9" r="3" />
      <path d="M4 19c.4-3 2.6-4.6 5.5-4.6s5.1 1.6 5.5 4.6M16 6.2a3 3 0 0 1 0 5.6M17.5 14.6c1.6.5 2.6 1.9 2.9 4.4" />
    </>
  ),
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2.5v2.5H14zM18 18h2M18 14v1.5M14 19v1" />
    </>
  ),
  chart: <path d="M5 19V9M10 19V5M15 19v-7M20 19V8M4 19.5h17" />,
  menu: <path d="M4.5 7h15M4.5 12h15M4.5 17h15" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5M12 8v.1" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4.5 20.5 19h-17z" />
      <path d="M12 10v4M12 16.6v.1" />
    </>
  ),
  eye: (
    <>
      <path d="M3.5 12S7 6 12 6s8.5 6 8.5 6-3.5 6-8.5 6-8.5-6-8.5-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  empty: (
    <>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" />
      <path d="m4 8.5 8 4.5 8-4.5M12 13v7" />
    </>
  ),
} as const;

export type AdminIconName = keyof typeof PATHS;

export function AdminIcon({
  name,
  className = 'size-5',
}: {
  name: AdminIconName;
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
      {PATHS[name]}
    </svg>
  );
}
