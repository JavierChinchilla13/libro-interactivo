import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { homeFor, useSession } from '../../features/auth/session';
import { publicApi, publicKeys } from '../../features/home/api';
import { Brand } from '../../shared/ui/Brand';
import { MAIN_ID, navTabLg, SkipLink } from '../../shared/ui/nav';

const ctaClass = () => 'btn btn-primary btn-compact';

const FOOTER_LINKS = [
  { to: '/wiki', label: 'Wiki' },
  { to: '/actualizaciones', label: 'Actualizaciones' },
  { to: '/fan-arts', label: 'Fan arts' },
  { to: '/contacto', label: 'Contacto' },
  { to: '/#comprar', label: 'Cómo comprar' },
] as const;

const footerLink = 'link-slide inline-flex min-h-11 items-center hover:text-text';

/** Marco de las páginas públicas: cabecera fija, contenido y pie. Mobile-first (menú desplegable en el celular). */
export function PublicLayout() {
  const session = useSession();
  const user = session.data;
  const [open, setOpen] = useState(false);
  // La portada no se anima al entrar: lo primero que se ve (titular y portada) es lo que mide el LCP.
  const isHome = useLocation().pathname === '/';
  const site = useQuery({ queryKey: publicKeys.site, queryFn: publicApi.site, retry: false });
  const social = site.data?.social ?? [];
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="site-header sticky top-0 z-40 border-b border-line bg-bg">
        <div className="mx-auto flex w-full max-w-[var(--token-page-max)] items-center justify-between gap-3 px-4 py-2.5">
          <Brand />
          <button
            type="button"
            className="btn btn-secondary btn-compact lg:hidden"
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
            className={`${open ? 'flex' : 'hidden'} absolute inset-x-0 top-full flex-col gap-1 border-b border-line bg-bg p-3 lg:static lg:flex lg:flex-row lg:items-center lg:border-0 lg:bg-transparent lg:p-0`}
          >
            <NavLink to="/" end viewTransition className={navTabLg}>
              Inicio
            </NavLink>
            <NavLink to="/wiki" viewTransition className={navTabLg}>
              Wiki
            </NavLink>
            <NavLink to="/actualizaciones" viewTransition className={navTabLg}>
              Actualizaciones
            </NavLink>
            <NavLink to="/fan-arts" viewTransition className={navTabLg}>
              Fan arts
            </NavLink>
            <NavLink to="/contacto" viewTransition className={navTabLg}>
              Contacto
            </NavLink>
            <Link
              to={{ pathname: '/', hash: '#comprar' }}
              className={navTabLg({ isActive: false })}
            >
              Comprar
            </Link>
            {user ? (
              <NavLink to={homeFor(user)} className={ctaClass}>
                Mi panel
              </NavLink>
            ) : (
              <>
                <NavLink to="/ingresar" viewTransition className={navTabLg}>
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
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="mx-auto w-full max-w-[var(--token-page-max)] flex-1 px-4 py-8 focus:outline-none sm:py-12"
      >
        <div className={isHome ? undefined : 'fade-up'}>
          <Outlet />
        </div>
      </main>
      <footer className="border-t border-line bg-sunken text-sm text-muted">
        <div className="mx-auto grid w-full max-w-[var(--token-page-max)] gap-8 px-4 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
          <div className="flex flex-col gap-3">
            <Brand />
            <p className="max-w-xs">Una saga que se lee, se descubre y se juega.</p>
          </div>
          <div className="flex flex-col gap-1 md:items-end">
            <nav aria-label="Pie de página">
              <ul className="flex flex-wrap gap-x-6 md:justify-end">
                {FOOTER_LINKS.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} viewTransition className={footerLink}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            {social.length > 0 ? (
              <ul aria-label="Redes sociales" className="flex flex-wrap gap-x-6 md:justify-end">
                {social.map((link) => (
                  <li key={link.url}>
                    <a
                      className={footerLink}
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
          </div>
        </div>
        <p className="border-t border-line px-4 py-2 text-center text-xs">
          Universo Memorias ·{' '}
          <Link
            to="/estado"
            className="inline-flex min-h-11 items-center underline hover:text-text"
          >
            Estado del sitio
          </Link>
        </p>
      </footer>
    </div>
  );
}
