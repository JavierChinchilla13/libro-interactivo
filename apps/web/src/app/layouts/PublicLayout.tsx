import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet } from 'react-router';
import { homeFor, useSession } from '../../features/auth/session';
import { publicApi, publicKeys } from '../../features/home/api';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-token px-3 py-2 text-sm font-medium ${isActive ? 'bg-surface-alt text-text' : 'text-muted hover:text-text'}`;

/** Marco de las páginas públicas: cabecera, contenido y pie. Mobile-first. */
export function PublicLayout() {
  const session = useSession();
  const user = session.data;
  const site = useQuery({ queryKey: publicKeys.site, queryFn: publicApi.site, retry: false });
  const social = site.data?.social ?? [];
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
            <NavLink to="/wiki" className={linkClass}>
              Wiki
            </NavLink>
            <NavLink to="/actualizaciones" className={linkClass}>
              Actualizaciones
            </NavLink>
            <NavLink to="/fan-arts" className={linkClass}>
              Fan arts
            </NavLink>
            <NavLink to="/contacto" className={linkClass}>
              Contacto
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
        <div className="mx-auto flex w-full max-w-[var(--token-page-max)] flex-col items-center gap-2 px-4">
          {social.length > 0 ? (
            <ul
              aria-label="Redes sociales"
              className="flex flex-wrap justify-center gap-x-4 gap-y-1"
            >
              {social.map((link) => (
                <li key={link.url}>
                  <a
                    className="underline"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <p>
            Libro Interactivo · universo Memorias ·{' '}
            <Link to="/estado" className="underline">
              Estado del sitio
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
