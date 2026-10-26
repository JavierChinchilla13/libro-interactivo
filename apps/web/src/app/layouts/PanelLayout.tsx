import { Link, Outlet, useLocation, useMatch } from 'react-router';
import { WelcomeModal } from '../../features/reader/WelcomeModal';
import { Brand } from '../../shared/ui/Brand';
import { PageBackground } from '../../shared/ui/PageBackground';
import { bottomTab, MAIN_ID, navTab, SkipLink } from '../../shared/ui/nav';
import { StaffSwitcher } from '../../shared/ui/StaffSwitcher';
import { UserMenu } from '../../shared/ui/UserMenu';

const ITEMS = [
  { to: '/panel', label: 'Panel', section: 'panel' },
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

/**
 * Marco del panel del lector: navegación inferior en el celular, superior en escritorio.
 * Aquí aparece el mensaje de bienvenida cuando el servidor dice que toca.
 */
export function PanelLayout() {
  const current = sectionOf(useLocation().pathname);
  // En el quiz solo queda la marca: sin «Salir» ni pestañas que cierren la sesión o abandonen sin querer.
  const inQuiz = useMatch('/panel/quiz/:quizId') !== null;
  const inGame = useMatch('/panel/juego/:bookId') !== null;
  const immersive = inQuiz || inGame;

  return (
    <div className={`flex min-h-dvh flex-col ${immersive ? '' : 'pb-16 sm:pb-0'}`}>
      <SkipLink />
      <PageBackground fallback="first" />
      <header className="site-header sticky top-3 z-40 px-3">
        <div className="nav-pill mx-auto flex w-full max-w-[var(--token-page-max)] items-center justify-between gap-4 py-1.5 pl-5 pr-2">
          <Brand to="/panel" />
          {immersive ? null : (
            <>
              <nav aria-label="Panel" className="hidden gap-1 sm:flex">
                {ITEMS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    viewTransition
                    aria-current={current === item.section ? 'page' : undefined}
                    className={navTab({ isActive: current === item.section })}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center gap-2">
                <StaffSwitcher className="hidden 2xl:inline-flex" />
                <UserMenu />
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
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bg sm:hidden"
        >
          {ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={current === item.section ? 'page' : undefined}
              className={bottomTab({ isActive: current === item.section })}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
      <WelcomeModal />
    </div>
  );
}
