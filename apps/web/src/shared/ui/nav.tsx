/**
 * Piezas de navegación compartidas por los tres marcos (público, panel del lector y administración): un solo
 * estilo de pestaña activa y el enlace «Saltar al contenido» para quien navega con teclado.
 */

/** Base de la pestaña: el subrayado es un pseudoelemento que solo cambia de escala (composición, sin repintar). */
const tabBase =
  'relative inline-flex min-h-11 items-center px-3.5 text-sm font-medium transition-colors duration-(--token-dur-fast) ease-token-out after:absolute after:inset-x-3.5 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-(--token-dur-fast) after:ease-token-out';
const tabIdle = 'text-muted hover:text-text hover:after:scale-x-40';

/** Pestaña de la barra superior (en fila desde `md`): la activa se subraya en cian; en el menú desplegable, se resalta. */
export const navTab = ({ isActive }: { isActive: boolean }) =>
  `${tabBase} ${isActive ? 'text-primary max-md:bg-surface-alt md:text-text md:after:scale-x-100' : tabIdle}`;

/** Igual, pero la fila empieza en `xl` (1280 px): la cabecera pública lleva más pestañas y por debajo no caben sin romper palabras. */
export const navTabLg = ({ isActive }: { isActive: boolean }) =>
  `${tabBase} ${isActive ? 'text-primary max-xl:bg-surface-alt xl:text-text xl:after:scale-x-100' : tabIdle}`;

/** Pestaña inferior del panel en el celular: la activa lleva una marca cian arriba (sin brillo). */
export const bottomTab = ({ isActive }: { isActive: boolean }) =>
  `relative flex min-h-14 flex-1 flex-col items-center justify-center text-xs font-medium transition-colors duration-(--token-dur-fast) ease-token-out ${
    isActive
      ? 'text-primary before:absolute before:top-0 before:h-0.5 before:w-10 before:rounded-full before:bg-primary'
      : 'text-muted hover:text-text'
  }`;

/** Enlace del menú lateral de administración. */
export const sideLink = ({ isActive }: { isActive: boolean }) =>
  `relative flex min-h-11 items-center rounded-token-sm px-3 text-sm font-medium transition-colors duration-(--token-dur-fast) ease-token-out ${
    isActive
      ? 'bg-primary/12 text-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary'
      : 'text-muted hover:bg-surface-alt/70 hover:text-text'
  }`;

/** Id del contenido principal: el destino de «Saltar al contenido». */
export const MAIN_ID = 'contenido';

/** Primer elemento enfocable de la página: solo se ve al enfocarlo con el teclado. */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-token-sm focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-contrast"
    >
      Saltar al contenido
    </a>
  );
}
