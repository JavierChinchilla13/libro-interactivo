import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { homeFor, useSession } from '../../features/auth/session';
import { publicApi, publicKeys } from '../../features/home/api';
import { Brand } from '../../shared/ui/Brand';
import { PageBackground } from '../../shared/ui/PageBackground';
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

/**
 * Marco de las páginas públicas: barra flotante en píldora, contenido y un pie mínimo. Mobile-first (en el celular el
 * menú se despliega bajo la píldora).
 */
export function PublicLayout() {
  const session = useSession();
  const user = session.data;
  const [open, setOpen] = useState(false);
  // La portada no se anima al entrar: lo primero que se ve (titular) es lo que mide el LCP.
  const isHome = useLocation().pathname === '/';
  const site = useQuery({ queryKey: publicKeys.site, queryFn: publicApi.site, retry: false });
  const social = site.data?.social ?? [];
  return (
    <div className="relative flex min-h-dvh flex-col">
      <SkipLink />
      <PageBackground />
      {isHome ? <div aria-hidden="true" className="hero-mesh" /> : null}
      <header className="site-header sticky top-3 z-40 px-3">
        <div className="nav-pill mx-auto flex w-full max-w-[var(--token-page-max)] items-center justify-between gap-3 py-1.5 pl-5 pr-2 lg:pl-7">
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
            className={`${open ? 'flex' : 'hidden'} nav-menu absolute inset-x-3 top-full mt-2 flex-col gap-1 p-3 lg:static lg:mt-0 lg:flex lg:flex-1 lg:flex-row lg:items-center lg:justify-end lg:gap-1 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none`}
          >
            <div className="flex flex-col gap-1 lg:ml-8 lg:mr-auto lg:flex-row lg:items-center">
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
            </div>
            <span aria-hidden="true" className="mx-3 hidden h-6 w-px bg-line lg:block" />
            <div className="flex flex-col gap-1 lg:flex-row lg:items-center">
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
            </div>
          </nav>
        </div>
      </header>
      <main
        id={MAIN_ID}
        tabIndex={-1}
        className="relative z-10 mx-auto w-full max-w-[var(--token-page-max)] flex-1 px-4 py-8 focus:outline-none sm:py-12"
      >
        <div className={isHome ? undefined : 'fade-up'}>
          <Outlet />
        </div>
      </main>
      <footer className="relative z-10 border-t border-line bg-sunken text-sm text-muted">
        <div className="mx-auto flex w-full max-w-[var(--token-page-max)] flex-col items-center gap-2 px-4 py-8 text-center">
          <nav aria-label="Pie de página">
            <ul className="flex flex-wrap justify-center gap-x-6">
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
            <ul aria-label="Redes sociales" className="flex flex-wrap justify-center gap-x-6">
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
          <p className="label mt-3 !tracking-[0.2em]">
            © 2026 Universo Memorias. Una saga que se lee, se descubre y se juega.
          </p>
          <Link
            to="/estado"
            className="inline-flex min-h-11 items-center underline hover:text-text"
          >
            Estado del sitio
          </Link>
        </div>
      </footer>
    </div>
  );
}
