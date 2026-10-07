import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { homeFor, isStaff, useLogout, useSession } from '../../features/auth/session';
import { WelcomeModal } from '../../features/reader/WelcomeModal';
import { Button } from '../../shared/ui/controls';

const ITEMS = [
  { to: '/panel', label: 'Panel', end: true },
  { to: '/panel/resultados', label: 'Resultados', end: false },
  { to: '/panel/extras', label: 'Extras', end: false },
  { to: '/panel/cuenta', label: 'Cuenta', end: false },
] as const;

const top = ({ isActive }: { isActive: boolean }) =>
  `rounded-token px-3 py-2 text-sm font-medium ${isActive ? 'bg-surface-alt text-text' : 'text-muted hover:text-text'}`;
const bottom = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center text-xs font-medium ${isActive ? 'text-text' : 'text-muted'}`;

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
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[var(--token-page-max)] items-center justify-between gap-4 px-4 py-3">
          <Link to="/panel" className="font-display text-lg font-bold">
            Libro Interactivo
          </Link>
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
      <main className="mx-auto w-full max-w-[var(--token-page-max)] flex-1 px-4 py-6">
        <Outlet />
      </main>
      <nav
        aria-label="Panel (móvil)"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface sm:hidden"
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
