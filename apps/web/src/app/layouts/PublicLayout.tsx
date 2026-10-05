import { NavLink, Outlet } from 'react-router';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-token px-3 py-2 text-sm font-medium ${isActive ? 'bg-surface-alt text-text' : 'text-muted hover:text-text'}`;

/** Marco de las páginas públicas: cabecera, contenido y pie. Mobile-first. */
export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[var(--token-page-max)] items-center justify-between gap-4 px-4 py-3">
          <span className="font-display text-lg font-bold">Libro Interactivo</span>
          <nav aria-label="Principal" className="flex gap-1">
            <NavLink to="/" end className={linkClass}>
              Inicio
            </NavLink>
            <NavLink to="/estado" className={linkClass}>
              Estado
            </NavLink>
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
