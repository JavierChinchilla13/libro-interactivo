import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { crumbsFor, documentTitle, locate, navForRole } from '../../features/admin/adminNav';
import '../../features/admin/adminTheme.css';
import { useNavCounts } from '../../features/admin/overview';
import { Breadcrumbs, CrumbLeafProvider } from '../../features/admin/components/Breadcrumbs';
import { ConfirmProvider } from '../../features/admin/components/ConfirmDialog';
import { ToastProvider } from '../../features/admin/components/Toast';
import { useSession } from '../../features/auth/session';
import { AdminIcon } from '../../shared/ui/adminIcons';
import { MAIN_ID, SkipLink } from '../../shared/ui/nav';
import { UserMenu } from '../../shared/ui/UserMenu';

const WIDE = '(min-width: 1024px)';

/** `true` mientras al menú le queda contenido por debajo (para mostrar el degradado que avisa que sigue). */
function useMoreBelow(ref: RefObject<HTMLElement | null>) {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [ref]);
  return more;
}

/** Elementos que reciben el foco dentro del cajón (para atraparlo mientras está abierto). */
const FOCUSABLE = 'a[href], button:not([disabled])';

/**
 * Marco de la administración: menú lateral por tareas en escritorio y cajón lateral en celular, barra superior con
 * el menú de usuario y migas sobre cada pantalla. El menú sale de `adminNav.ts` y solo muestra lo que la cuenta puede
 * usar (los permisos los decide el servidor).
 */
export function AdminLayout() {
  const session = useSession();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [leaf, setLeaf] = useState<string | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const navScroll = useRef<HTMLElement>(null);
  const moreBelow = useMoreBelow(navScroll);
  const groups = navForRole(session.data?.role);
  const counts = useNavCounts(session.data?.role);
  const where = locate(pathname);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) menuButton.current?.focus();
  }, []);

  // Título de la pestaña del navegador: «Quizzes · Administración · Universo Memorias».
  useEffect(() => {
    const previous = document.title;
    document.title = documentTitle(pathname);
    return () => {
      document.title = previous;
    };
  }, [pathname]);

  // Al navegar se cierra el cajón y la miga vuelve a ser genérica hasta que la nueva pantalla ponga su nombre.
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setOpen(false);
    setLeaf(null);
  }

  // Abierto: sin desplazamiento de fondo, foco dentro del cajón y, si la ventana se ensancha, se cierra solo.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawer.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null;
    const onChange = () => {
      if (media?.matches) setOpen(false);
    };
    media?.addEventListener('change', onChange);
    return () => {
      document.body.style.overflow = previousOverflow;
      media?.removeEventListener('change', onChange);
    };
  }, [open]);

  const onDrawerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(drawer.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <ToastProvider>
      <ConfirmProvider>
        <CrumbLeafProvider setLeaf={setLeaf}>
          <div className="admin-shell min-h-dvh lg:grid lg:grid-cols-[var(--admin-sidebar-w)_1fr]">
            <SkipLink />
            <div
              className="admin-scrim"
              data-open={open}
              aria-hidden="true"
              onClick={() => close(true)}
            />
            <aside
              ref={drawer}
              id="admin-sidebar"
              className="admin-sidebar lg:sticky lg:top-0 lg:h-dvh"
              data-open={open}
              onKeyDown={onDrawerKeyDown}
            >
              <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
                <NavLink
                  to="/admin"
                  end
                  className="flex min-h-11 min-w-0 flex-col justify-center rounded-token-sm"
                >
                  <span className="font-display text-lg font-bold leading-tight tracking-wide">
                    Universo Memorias
                  </span>
                  <span className="text-xs text-muted">Administración</span>
                </NavLink>
                <button
                  type="button"
                  className="admin-icon-btn lg:hidden"
                  aria-label="Cerrar el menú"
                  onClick={() => close(true)}
                >
                  <AdminIcon name="close" />
                </button>
              </div>
              <nav
                ref={navScroll}
                aria-label="Administración"
                className="admin-nav-scroll"
                data-more={moreBelow}
              >
                {groups.map((group) => {
                  const labelId = `admin-group-${group.id}`;
                  return (
                    <div
                      key={group.id}
                      role="group"
                      aria-labelledby={group.label ? labelId : undefined}
                    >
                      {group.label ? (
                        <p id={labelId} className="admin-nav-group-label">
                          {group.label}
                        </p>
                      ) : null}
                      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                        {group.items.map((item) => (
                          <li key={item.id}>
                            <NavLink
                              to={item.to}
                              end={item.to === '/admin'}
                              className="admin-link"
                              onClick={() => setOpen(false)}
                            >
                              <AdminIcon name={item.icon} />
                              <span className="min-w-0">{item.label}</span>
                              {counts[item.id] ? (
                                <span
                                  className="admin-link-count"
                                  aria-label={`${counts[item.id]} ${item.id === 'mensajes' ? 'sin leer' : 'en borrador'}`}
                                >
                                  {counts[item.id]}
                                </span>
                              ) : null}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </nav>
            </aside>

            <div className="flex min-w-0 flex-col">
              <header className="admin-topbar">
                <button
                  ref={menuButton}
                  type="button"
                  className="admin-icon-btn lg:hidden"
                  aria-label="Abrir el menú"
                  aria-expanded={open}
                  aria-controls="admin-sidebar"
                  onClick={() => setOpen(true)}
                >
                  <AdminIcon name="menu" />
                </button>
                <p className="min-w-0 flex-1 truncate text-base font-semibold lg:hidden">
                  {where?.item.label ?? 'Administración'}
                </p>
                <UserMenu className="ml-auto" looseZones={false} />
              </header>
              <main
                id={MAIN_ID}
                tabIndex={-1}
                className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-8 sm:py-8"
              >
                <div className="fade-up mx-auto w-full max-w-[72rem]">
                  <Breadcrumbs crumbs={crumbsFor(pathname, leaf)} />
                  <Outlet />
                </div>
              </main>
            </div>
          </div>
        </CrumbLeafProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
