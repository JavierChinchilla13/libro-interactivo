import { Link, NavLink, Outlet } from 'react-router';
import { homeFor, useSession } from '../../features/auth/session';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-token px-3 py-2 text-sm font-medium ${isActive ? 'bg-surface-alt text-text' : 'text-muted hover:text-text'}`;

/** Marco de las páginas públicas: cabecera, contenido y pie. Mobile-first. */
export function PublicLayout() {
  const session = useSession();
  const user = session.data;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[var(--token-page-max)] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
          <Link to="/" className="font-display text-lg font-bold">
            Libro Interactivo
          </Link>
          <nav aria-label="Principal" className="flex flex-wrap gap-1">
            <NavLink to="/" end className={linkClass}>
              Inicio
            </NavLink>
            <NavLink to="/estado" className={linkClass}>
              Estado
            </NavLink>
            {user ? (
              <NavLink to={homeFor(user)} className={linkClass}>
                Mi panel
              </NavLink>
            ) : (
              <>
                <NavLink to="/ingresar" className={linkClass}>
                  Ingresar
                </NavLink>
                <NavLink to="/registro" className={linkClass}>
                  Crear cuenta
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[var(--token-page-max)] flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted">
        Libro Interactivo · universo Memorias
      </footer>
    </div>
  );
}
