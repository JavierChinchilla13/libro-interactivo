/** Nombre del sitio: va en el título de cada página y en las etiquetas sociales. */
export const SITE_NAME = 'Universo Memorias';

/** Lo que se dice del sitio cuando una página no trae descripción propia. */
export const DEFAULT_DESCRIPTION =
  'Universo Memorias: la saga que se lee, se descubre y se juega. Entra con el código QR de tu libro, resuelve los quizzes y explora el universo.';

/** Las descripciones largas se cortan aquí (lo que suelen mostrar los buscadores). */
export const MAX_DESCRIPTION = 160;

const DEFAULT_SITE_URL = 'https://universomemorias.com';

/**
 * Dirección pública del sitio, sin barra final. Las direcciones canónicas y las imágenes sociales salen de aquí, no del
 * host con el que se abrió la página (así `www` o una dirección de pruebas no duplican el sitio en los buscadores).
 */
export function siteUrl(): string {
  const raw = (import.meta.env as Record<string, string | undefined>)['VITE_SITE_URL']?.trim();
  return (raw || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

/** La imagen social por omisión, en `public/`. */
export function defaultImage(): string {
  return `${siteUrl()}/og-default.png`;
}

/** Dirección absoluta de una ruta del sitio (`/wiki` → `https://universomemorias.com/wiki`). */
export function absoluteUrl(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? '';
  const trimmed = clean.length > 1 ? clean.replace(/\/+$/, '') : clean;
  return `${siteUrl()}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

/** Texto plano de una descripción: sin etiquetas ni espacios repetidos, cortado en una palabra a 160 caracteres. */
export function describe(text: string | null | undefined, fallback = DEFAULT_DESCRIPTION): string {
  const plain = (text ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return fallback;
  if (plain.length <= MAX_DESCRIPTION) return plain;
  const cut = plain.slice(0, MAX_DESCRIPTION - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
