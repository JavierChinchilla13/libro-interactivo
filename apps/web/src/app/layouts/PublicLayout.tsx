import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { homeFor, isStaff, useSession } from '../../features/auth/session';
import { publicApi, publicKeys } from '../../features/home/api';
import { CookieNotice } from '../../features/legal/CookieNotice';
import { Brand } from '../../shared/ui/Brand';
import { PageBackground } from '../../shared/ui/PageBackground';
import { MAIN_ID, navTabLg, SkipLink } from '../../shared/ui/nav';
import { UserMenu } from '../../shared/ui/UserMenu';

const ctaClass = () => 'btn btn-primary btn-compact whitespace-nowrap';

const LEGAL_LINKS = [
  { to: '/privacidad', label: 'Privacidad' },
  { to: '/terminos', label: 'Términos' },
  { to: '/cookies', label: 'Cookies' },
] as const;

/** El enlace mide 44 px de alto (táctil); la línea del `link-slide` va en el texto, no en el borde de esa caja. */
const footerLink = 'inline-flex min-h-11 items-center';
const footerText = 'link-slide py-0.5';

/**
 * Marco de las páginas públicas: barra flotante en píldora, contenido y un pie mínimo. Mobile-first (en el celular el
 * menú se despliega bajo la píldora).
 */
export function PublicLayout() {
  const session = useSession();
  const user = session.data;
  // El menú desplegable se cierra solo al cambiar de página: se recuerda en qué ruta se abrió.
  const [openAt, setOpenAt] = useState<string | null>(null);
  // La portada no se anima al entrar: lo primero que se ve (titular) es lo que mide el LCP.
  const location = useLocation();
  const open = openAt === location.pathname;
  const isHome = location.pathname === '/';
  // El fundido de entrada solo al navegar dentro de la app: en una carga directa el título se pinta ya visible.
  const firstLoad = location.key === 'default';
  const site = useQuery({ queryKey: publicKeys.site, queryFn: publicApi.site, retry: false });
  const social = site.data?.social ?? [];
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <SkipLink />
      <PageBackground stable={isHome} />
      <header className="site-header sticky top-3 z-40 px-3">
        <div className="nav-pill mx-auto flex w-full max-w-[var(--token-page-max)] items-center justify-between gap-3 py-1.5 pl-5 pr-2 xl:pl-7">
          <Brand />
          <button
            type="button"
            className="btn btn-secondary btn-compact xl:hidden"
            aria-expanded={open}
            aria-controls="menu-principal"
            onClick={() =>
              setOpenAt((value) => (value === location.pathname ? null : location.pathname))
            }
          >
            {open ? 'Cerrar' : 'Menú'}
          </button>
          <nav
            id="menu-principal"
            aria-label="Principal"
            onClick={() => setOpenAt(null)}
            className={`${open ? 'flex' : 'hidden'} nav-menu absolute inset-x-3 top-full mt-2 flex-col gap-1 p-3 xl:static xl:mt-0 xl:flex xl:flex-1 xl:flex-row xl:items-center xl:justify-end xl:gap-1 xl:border-0 xl:bg-transparent xl:p-0 xl:backdrop-blur-none`}
          >
            <div className="flex flex-col gap-1 xl:ml-8 xl:mr-auto xl:flex-row xl:items-center">
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
            <span aria-hidden="true" className="mx-3 hidden h-6 w-px bg-line xl:block" />
            <div className="flex flex-col gap-1 xl:flex-row xl:items-center">
              {user ? (
                <>
                  {isStaff(user) ? null : (
                    <NavLink to={homeFor(user)} className={ctaClass}>
                      Mi panel
                    </NavLink>
                  )}
                  <UserMenu alwaysShowName />
                </>
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
        className={`relative z-10 mx-auto w-full max-w-[var(--token-page-max)] flex-1 px-4 focus:outline-none ${
          isHome ? 'pb-8 sm:pb-12' : 'py-8 sm:py-12'
        }`}
      >
        <div className={isHome || firstLoad ? undefined : 'fade-up'}>
          <Outlet />
        </div>
      </main>
      <footer className="relative z-10 border-t border-line bg-sunken text-sm text-muted">
        <div className="mx-auto grid w-full max-w-[var(--token-page-max)] gap-x-12 gap-y-2 px-4 py-9 sm:py-12 md:grid-cols-[minmax(0,1fr)_auto] [html[data-cookie-notice]_&]:pb-44 sm:[html[data-cookie-notice]_&]:pb-28">
          <nav aria-label="Legal" className="md:col-start-2 md:row-start-1">
            <ul className="flex flex-wrap gap-x-7 md:justify-end">
              {LEGAL_LINKS.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className={`${footerLink} text-text`}>
                    <span className={footerText}>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-4 flex flex-col gap-1 md:col-start-1 md:row-start-1 md:mt-0">
            <p className="max-w-[40ch] py-3 leading-relaxed text-pretty">
              <span className="block text-text">© 2026 Universo Memorias</span>
              <span className="block">Una saga que se lee, se descubre y se juega.</span>
            </p>
            {social.length > 0 ? (
              <ul aria-label="Redes sociales" className="flex flex-wrap gap-x-7">
                {social.map((link) => (
                  <li key={link.url}>
                    <a
                      className={`${footerLink} hover:text-text`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className={footerText}>{link.label}</span>
                      <span className="sr-only"> (se abre en otra pestaña)</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </footer>
      <CookieNotice />
    </div>
  );
}
