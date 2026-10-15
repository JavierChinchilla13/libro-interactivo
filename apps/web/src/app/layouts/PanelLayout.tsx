import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router';
import { homeFor, isStaff, useLogout, useSession } from '../../features/auth/session';
import { WelcomeModal } from '../../features/reader/WelcomeModal';
import { Button } from '../../shared/ui/controls';
import { Brand } from '../../shared/ui/Brand';
import { bottomTab, MAIN_ID, navTab, SkipLink } from '../../shared/ui/nav';

const ITEMS = [
  { to: '/panel', label: 'Panel', end: true },
  { to: '/panel/resultados', label: 'Resultados', end: false },
  { to: '/panel/extras', label: 'Extras', end: false },
  { to: '/panel/cuenta', label: 'Cuenta', end: false },
] as const;

/**
 * Marco del panel del lector: navegación inferior en el celular, superior en escritorio.
 * Aquí aparece el mensaje de bienvenida cuando el servidor dice que toca.
 */
export function PanelLayout() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const user = session.data;
  // En el quiz solo queda la marca: sin «Salir» ni pestañas que cierren la sesión o abandonen sin querer.
  const inQuiz = useMatch('/panel/quiz/:quizId') !== null;
  const inGame = useMatch('/panel/juego/:bookId') !== null;
  const immersive = inQuiz || inGame;

  return (
    <div className={`flex min-h-dvh flex-col ${immersive ? '' : 'pb-16 sm:pb-0'}`}>
      <SkipLink />
      <header className="site-header sticky top-3 z-40 px-3">
        <div className="nav-pill mx-auto flex w-full max-w-[var(--token-page-max)] items-center justify-between gap-4 py-1.5 pl-5 pr-2">
          <Brand to="/panel" />
          {immersive ? null : (
            <>
              <nav aria-label="Panel" className="hidden gap-1 sm:flex">
                {ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    viewTransition
                    className={navTab}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <div className="flex items-center gap-2">
                {isStaff(user) ? (
                  <Link to={homeFor(user)} className="text-sm underline">
                    Administración
                  </Link>
                ) : null}
                <Button
                  variant="secondary"
                  loading={logout.isPending}
                  onClick={() =>
                    logout.mutate(undefined, {
                      onSettled: () => void navigate('/ingresar', { replace: true }),
                    })
                  }
                >
                  Salir
                </Button>
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
            <NavLink key={item.to} to={item.to} end={item.end} className={bottomTab}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
      <WelcomeModal />
    </div>
  );
}
