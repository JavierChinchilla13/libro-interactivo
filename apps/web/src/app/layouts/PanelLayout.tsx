import { Link, Outlet, useLocation, useMatch } from 'react-router';
import { BOOK_SECTIONS, bookSectionOf } from '../../features/reader/bookSections';
import { useLibrary } from '../../features/reader/useLibrary';
import { WelcomeModal } from '../../features/reader/WelcomeModal';
import { Brand } from '../../shared/ui/Brand';
import { PageBackground } from '../../shared/ui/PageBackground';
import { bottomTab, MAIN_ID, navTab, SkipLink } from '../../shared/ui/nav';
import { UserMenu } from '../../shared/ui/UserMenu';

const ITEMS = [
  { to: '/panel', label: 'Tus libros', section: 'panel' },
  { to: '/panel/resultados', label: 'Resultados', section: 'resultados' },
  { to: '/panel/extras', label: 'Extras', section: 'extras' },
] as const;

type Section = (typeof ITEMS)[number]['section'];

/**
 * A qué pestaña pertenece una dirección. Resultados y extras viven ahora dentro de cada libro
 * (`/panel/libros/:slug/resultados`), así que se reconocen también ahí; la página del libro cuenta como «Panel».
 */
export function sectionOf(pathname: string): Section | null {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/panel' || /^\/panel\/libros\/[^/]+$/.test(path)) return 'panel';
  if (path.startsWith('/panel/resultados') || /^\/panel\/libros\/[^/]+\/resultados/.test(path)) {
    return 'resultados';
  }
  if (path.startsWith('/panel/extras') || /^\/panel\/libros\/[^/]+\/extras/.test(path)) {
    return 'extras';
  }
  return null;
}

/** El libro cuya dirección se está viendo (`/panel/libros/:slug…`), si hay uno. */
export function bookSlugOf(pathname: string): string | null {
  return /^\/panel\/libros\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

/**
 * Marco del panel del lector: navegación inferior en el celular, superior en escritorio.
 * Aquí aparece el mensaje de bienvenida cuando el servidor dice que toca.
 */
export function PanelLayout() {
  const { pathname } = useLocation();
  const current = sectionOf(pathname);
  // Dentro de un libro las categorías son las del libro: arriba solo queda volver a «Tus libros».
  const bookSlug = bookSlugOf(pathname);
  const bookSection = bookSectionOf(pathname);
  // Un libro sin abrir (o «próximamente») solo tiene su resumen: la barra de abajo no ofrece lo demás.
  const library = useLibrary(bookSlug !== null);
  const bookAccess = library.data?.books.find((entry) => entry.book.slug === bookSlug)?.access;
  const bookTabs = bookAccess === 'open' ? BOOK_SECTIONS : BOOK_SECTIONS.slice(0, 1);
  // En el quiz solo queda la marca: sin «Salir» ni pestañas que cierren la sesión o abandonen sin querer.
  const inQuiz = useMatch('/panel/quiz/:quizId') !== null;
  const inGame = useMatch('/panel/juego/:bookId') !== null;
  const immersive = inQuiz || inGame;

  return (
    <div
      className={`flex min-h-dvh flex-col ${immersive ? '' : 'pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0'}`}
    >
      <SkipLink />
      <PageBackground fallback="first" />
      <header className="site-header sticky top-3 z-40 px-3">
        <div className="nav-pill mx-auto flex w-full max-w-[var(--token-page-max)] items-center justify-between gap-4 py-1.5 pl-5 pr-2">
          <Brand to="/panel" />
          {immersive ? null : (
            <>
              <nav aria-label="Panel" className="hidden gap-1 sm:flex">
                {bookSlug ? (
                  <Link to="/panel" viewTransition className={navTab({ isActive: false })}>
                    ‹ Tus libros
                  </Link>
                ) : (
                  ITEMS.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      viewTransition
                      aria-current={current === item.section ? 'page' : undefined}
                      className={navTab({ isActive: current === item.section })}
                    >
                      {item.label}
                    </Link>
                  ))
                )}
              </nav>
              <div className="flex items-center gap-2">
                <UserMenu looseZones={false} />
              </div>
            </>
          )}
        </div>
      </header>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-[var(--token-page-max)] flex-1 px-4 py-6 focus:outline-none sm:py-10"
      >
        <div className="fade-up">
          <Outlet />
        </div>
      </main>
      {immersive ? null : (
        <nav
          aria-label="Panel (móvil)"
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] sm:hidden"
        >
          {bookSlug ? (
            <>
              <Link to="/panel" className={bottomTab({ isActive: false })}>
                ‹ Tus libros
              </Link>
              {bookTabs.map((item) => (
                <Link
                  key={item.id}
                  to={`/panel/libros/${bookSlug}${item.path}`}
                  aria-current={bookSection === item.id ? 'page' : undefined}
                  className={bottomTab({ isActive: bookSection === item.id })}
                >
                  {item.label}
                </Link>
              ))}
            </>
          ) : (
            ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={current === item.section ? 'page' : undefined}
                className={bottomTab({ isActive: current === item.section })}
              >
                {item.label}
              </Link>
            ))
          )}
        </nav>
      )}
      <WelcomeModal />
    </div>
  );
}
