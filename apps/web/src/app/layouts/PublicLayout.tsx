import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { homeFor, useSession } from '../../features/auth/session';
import { publicApi, publicKeys } from '../../features/home/api';
import { Brand } from '../../shared/ui/Brand';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3.5 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
      : 'text-muted hover:bg-surface-alt/70 hover:text-text'
  }`;
const ctaClass = () => 'btn btn-primary !min-h-10 !px-4';

const FOOTER_LINKS = [
  { to: '/wiki', label: 'Wiki' },
  { to: '/actualizaciones', label: 'Actualizaciones' },
  { to: '/fan-arts', label: 'Fan arts' },
  { to: '/contacto', label: 'Contacto' },
] as const;

/** Marco de las páginas públicas: cabecera de vidrio fija, contenido y pie. Mobile-first (menú desplegable en el celular). */
export function PublicLayout() {
  const session = useSession();
  const user = session.data;
  const [open, setOpen] = useState(false);
  const site = useQuery({ queryKey: publicKeys.site, queryFn: publicApi.site, retry: false });
  const social = site.data?.social ?? [];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[var(--token-page-max)] items-center justify-between gap-3 px-4 py-2.5">
          <Brand />
          <button
            type="button"
            className="btn btn-secondary !min-h-10 !px-4 md:hidden"
            aria-expanded={open}
            aria-controls="menu-principal"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? 'Cerrar' : 'Menú'}
          </button>
          <nav
            id="menu-principal"
            aria-label="Principal"
            onClick={() => setOpen(false)}
            className={`${open ? 'flex' : 'hidden'} absolute inset-x-0 top-full flex-col gap-1 border-b border-line bg-bg/95 p-3 backdrop-blur-xl md:static md:flex md:flex-row md:items-center md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none`}
          >
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
              <NavLink to={homeFor(user)} className={ctaClass}>
                Mi panel
              </NavLink>
            ) : (
              <>
                <NavLink to="/ingresar" className={linkClass}>
                  Ingresar
                </NavLink>
                <NavLink to="/registro" className={ctaClass}>
                  Crear cuenta
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[var(--token-page-max)] flex-1 px-4 py-8 sm:py-12">
        <div className="fade-up">
          <Outlet />
        </div>
      </main>
      <footer className="relative mt-10 border-t border-line bg-bg/60 text-sm text-muted">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent"
        />
        <div className="mx-auto grid w-full max-w-[var(--token-page-max)] gap-8 px-4 py-10 md:grid-cols-[1.2fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <Brand />
            <p className="max-w-xs">
              Universo Memorias: una saga que se lee, se descubre y se juega.
            </p>
          </div>
          <nav aria-label="Pie de página" className="flex flex-col gap-1.5">
            <p className="eyebrow mb-1">Explora</p>
            {FOOTER_LINKS.map((item) => (
              <Link key={item.to} to={item.to} className="hover:text-text">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-1.5">
            {social.length > 0 ? (
              <>
                <p className="eyebrow mb-1">Síguenos</p>
                <ul aria-label="Redes sociales" className="flex flex-col gap-1.5">
                  {social.map((link) => (
                    <li key={link.url}>
                      <a
                        className="hover:text-text"
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="mt-3">
              <Link to="/estado" className="underline hover:text-text">
                Estado del sitio
              </Link>
            </p>
          </div>
        </div>
        <p className="border-t border-line py-4 text-center text-xs">
          Libro Interactivo · universo Memorias
        </p>
      </footer>
    </div>
  );
}
