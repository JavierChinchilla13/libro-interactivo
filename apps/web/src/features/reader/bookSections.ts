/** Las secciones de un libro: el resumen (su página) y las dos categorías con su contenido propio. */
export const BOOK_SECTIONS = [
  { id: 'resumen', label: 'Resumen', path: '' },
  { id: 'resultados', label: 'Resultados', path: '/resultados' },
  { id: 'extras', label: 'Extras', path: '/extras' },
] as const;

export type BookSection = (typeof BOOK_SECTIONS)[number]['id'];

/** En qué sección de un libro está una dirección (`/panel/libros/:slug[/resultados|/extras]`). */
export function bookSectionOf(pathname: string): BookSection {
  const path = pathname.replace(/\/+$/, '');
  if (/^\/panel\/libros\/[^/]+\/resultados(\/|$)/.test(path)) return 'resultados';
  if (/^\/panel\/libros\/[^/]+\/extras(\/|$)/.test(path)) return 'extras';
  return 'resumen';
}
