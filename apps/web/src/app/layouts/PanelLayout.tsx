import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { homeFor, isStaff, useLogout, useSession } from '../../features/auth/session';
import { WelcomeModal } from '../../features/reader/WelcomeModal';
import { Button } from '../../shared/ui/controls';
import { Brand } from '../../shared/ui/Brand';

const ITEMS = [
  { to: '/panel', label: 'Panel', end: true },
  { to: '/panel/resultados', label: 'Resultados', end: false },
  { to: '/panel/extras', label: 'Extras', end: false },
  { to: '/panel/cuenta', label: 'Cuenta', end: false },
] as const;

const top = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3.5 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
      : 'text-muted hover:bg-surface-alt/70 hover:text-text'
  }`;
const bottom = ({ isActive }: { isActive: boolean }) =>
  `relative flex min-h-14 flex-1 flex-col items-center justify-center text-xs font-medium transition ${
    isActive
      ? 'text-primary before:absolute before:top-0 before:h-0.5 before:w-10 before:rounded-full before:bg-primary before:shadow-glow'
      : 'text-muted'
  }`;

/**
 * Marco del panel del lector: navegación inferior en el celular, superior en escritorio.
 * Aquí aparece el mensaje de bienvenida cuando el servidor dice que toca.
 */
export function PanelLayout() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const user = session.data;

  return (
    <div className="flex min-h-dvh flex-col pb-16 sm:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[var(--token-page-max)] items-center justify-between gap-4 px-4 py-2.5">
          <Brand to="/panel" />
          <nav aria-label="Panel" className="hidden gap-1 sm:flex">
            {ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={top}>
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
        </div>
      </header>
      <main className="mx-auto w-full max-w-[var(--token-page-max)] flex-1 px-4 py-6 sm:py-10">
        <div className="fade-up">
          <Outlet />
        </div>
      </main>
      <nav
        aria-label="Panel (móvil)"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-bg/85 backdrop-blur-xl sm:hidden"
      >
        {ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={bottom}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <WelcomeModal />
    </div>
  );
}
