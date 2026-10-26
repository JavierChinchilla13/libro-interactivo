import type { AuthUser } from '@libro/shared';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router';
import { useLogout, useSession } from '../../features/auth/session';
import { GearIcon, LogoutIcon } from './icons';
import { zoneOf } from './StaffSwitcher';

type Role = AuthUser['role'];

/**
 * Una opción del menú de usuario: o lleva a una dirección (`to`) o ejecuta una acción conocida (`action`). `roles`
 * limita quién la ve (sin `roles`, todas las cuentas). Para agregar una opción basta una entrada nueva en la lista.
 */
export interface UserMenuItem {
  id: string;
  label: string;
  to?: string;
  action?: 'logout';
  icon?: ReactNode;
  roles?: readonly Role[];
  /** Zona a la que lleva (marca `aria-current` en la actual): así el selector de zonas cabe dentro del menú. */
  zone?: 'site' | 'panel' | 'admin';
  /** Las opciones de un mismo grupo van juntas; entre grupos hay una línea. */
  group?: string;
  /** Solo se ve donde el selector de zonas no cabe suelto en la barra (por debajo de 1536 px). */
  narrowOnly?: boolean;
}

const STAFF: readonly Role[] = ['EDITOR', 'ADMIN'];

export const USER_MENU_ITEMS: readonly UserMenuItem[] = [
  {
    id: 'zona-sitio',
    label: 'Ver sitio',
    to: '/',
    zone: 'site',
    roles: STAFF,
    group: 'zonas',
    narrowOnly: true,
  },
  {
    id: 'zona-panel',
    label: 'Mi panel',
    to: '/panel',
    zone: 'panel',
    roles: STAFF,
    group: 'zonas',
    narrowOnly: true,
  },
  {
    id: 'zona-admin',
    label: 'Admin',
    to: '/admin',
    zone: 'admin',
    roles: STAFF,
    group: 'zonas',
    narrowOnly: true,
  },
  { id: 'ajustes', label: 'Ajustes', to: '/panel/cuenta', icon: <GearIcon />, group: 'cuenta' },
  { id: 'salir', label: 'Salir', action: 'logout', icon: <LogoutIcon />, group: 'cuenta' },
];

const ROLE_LABEL: Record<Role, string | null> = {
  USER: null,
  EDITOR: 'Editora',
  ADMIN: 'Administradora',
};

/** Iniciales para el avatar: la primera letra (o emoji) de las dos primeras palabras; `?` si no hay nombre. */
export function initialsOf(name: string | undefined): string {
  const all = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (all.length === 0) return '?';
  // Las palabras que empiezan con letra mandan; un emoji suelto solo cuenta si no hay otra cosa.
  const lettered = all.filter((word) => /^\p{L}/u.test(word));
  const words = lettered.length > 0 ? lettered : all;
  const first = (word: string) => {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });
      return [...segmenter.segment(word)][0]?.segment ?? '';
    }
    return Array.from(word)[0] ?? '';
  };
  const letters = [words[0], words.length > 1 ? words[words.length - 1] : undefined]
    .filter((word): word is string => word !== undefined)
    .map(first);
  return letters.join('').toLocaleUpperCase('es');
}

/** El primer nombre para el botón en celular: la primera palabra que empieza con letra (o la primera, si no hay). */
export function firstNameOf(name: string | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return words.find((word) => /^\p{L}/u.test(word)) ?? words[0] ?? '';
}

/**
 * Menú de usuario de las tres zonas (sitio, panel y administración): avatar de iniciales + nombre de la sesión, y un
 * menú con las opciones de `USER_MENU_ITEMS`. Teclado: Enter, Espacio o ↓ abren con el foco en la primera opción (↑
 * en la última); ↑ ↓ Inicio Fin se mueven; Escape cierra y devuelve el foco al botón; Tab o un clic fuera cierran. En
 * el celular el menú es una hoja desde abajo. Sin sesión no pinta nada.
 */
export function UserMenu({
  items = USER_MENU_ITEMS,
  className = '',
  alwaysShowName = false,
  looseZones = true,
}: {
  items?: readonly UserMenuItem[];
  className?: string;
  /** Muestra el nombre también en pantallas estrechas (p. ej. dentro del menú desplegable del sitio). */
  alwaysShowName?: boolean;
  /** Hay un selector de zonas suelto en pantallas anchas (panel y administración); en el sitio no cabe y siempre va aquí. */
  looseZones?: boolean;
}) {
  const session = useSession();
  const user = session.data;
  const logout = useLogout();
  const navigate = useNavigate();
  const currentZone = zoneOf(useLocation().pathname);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const wanted = useRef<'first' | 'last'>('first');
  const panel = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const panelId = useId();

  const visible = items.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  // Al abrir, el foco va a la primera o a la última opción.
  useEffect(() => {
    if (!open) return;
    const list = refs.current.filter(
      (element): element is HTMLElement =>
        element !== null && getComputedStyle(element).display !== 'none',
    );
    (wanted.current === 'last' ? list[list.length - 1] : list[0])?.focus();
  }, [open]);

  // En pantallas anchas el panel se ancla bajo el botón (va en el `body` porque la píldora tiene filtro de fondo y
  // atraparía a un panel fijo). En el celular es una hoja desde abajo y estas medidas no se usan.
  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (rect)
        setAnchor({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  // Un clic o toque fuera cierra (sin quitar el foco de donde la persona lo puso).
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  if (!user) return null;
  const roleLabel = ROLE_LABEL[user.role];
  const name = user.name.trim() || 'Mi cuenta';

  const move = (event: KeyboardEvent<HTMLElement>) => {
    const list = refs.current.filter(
      (element): element is HTMLElement =>
        element !== null && getComputedStyle(element).display !== 'none',
    );
    const current = list.indexOf(event.currentTarget);
    const last = list.length - 1;
    const go = (index: number) => {
      event.preventDefault();
      list[(index + list.length) % list.length]?.focus();
    };
    if (event.key === 'ArrowDown') go(current + 1);
    else if (event.key === 'ArrowUp') go(current - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(last);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') {
      // El panel está al final del documento: el foco vuelve al botón y Tab sigue desde ahí.
      trigger.current?.focus();
      close(false);
    }
  };

  const openWith = (which: 'first' | 'last') => {
    wanted.current = which;
    setOpen(true);
  };

  return (
    // El clic no sube: dentro del menú desplegable del sitio no debe cerrarse el menú padre al abrir este.
    <div
      ref={root}
      className={`user-menu ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={trigger}
        type="button"
        className="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(false) : openWith('first'))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            openWith('first');
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            openWith('last');
          } else if (event.key === 'Escape' && open) close(true);
        }}
      >
        <span className="user-menu-avatar" aria-hidden="true">
          {initialsOf(user.name)}
        </span>
        <span className={`user-menu-name ${alwaysShowName ? '' : 'max-md:sr-only'}`}>{name}</span>
        {alwaysShowName || !firstNameOf(user.name) ? null : (
          // En celular, solo el primer nombre y corto (el nombre completo sigue en el nombre accesible del botón).
          <span aria-hidden="true" className="user-menu-first">
            {firstNameOf(user.name)}
          </span>
        )}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="user-menu-chevron">
          <path
            d="m6 9 6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open
        ? createPortal(
            <>
              <div className="user-menu-backdrop" aria-hidden="true" onClick={() => close(false)} />
              <div
                ref={panel}
                id={panelId}
                className="user-menu-panel"
                style={
                  anchor
                    ? ({
                        '--um-top': `${anchor.top}px`,
                        '--um-right': `${anchor.right}px`,
                      } as CSSProperties)
                    : undefined
                }
              >
                <div className="user-menu-who">
                  <p className="user-menu-who-name">{name}</p>
                  <p className="user-menu-who-meta">{roleLabel ?? user.email}</p>
                </div>
                <div role="menu" aria-label="Menú de usuario" className="flex flex-col gap-0.5">
                  {visible.map((item, index) => {
                    const common = {
                      role: 'menuitem' as const,
                      className: `user-menu-item ${item.narrowOnly && looseZones ? '2xl:hidden' : ''}`,
                      'aria-current':
                        item.zone && item.zone === currentZone ? ('page' as const) : undefined,
                      tabIndex: -1,
                      onKeyDown: move,
                    };
                    const content = (
                      <>
                        {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
                        <span className="min-w-0 flex-1 truncate">
                          {item.action === 'logout' && logout.isPending ? 'Saliendo…' : item.label}
                        </span>
                      </>
                    );
                    const previous = visible[index - 1];
                    const separator =
                      previous && previous.group !== item.group ? (
                        <div
                          role="separator"
                          className={`user-menu-sep ${previous.narrowOnly && looseZones ? '2xl:hidden' : ''}`}
                        />
                      ) : null;
                    if (item.to) {
                      return (
                        <Fragment key={item.id}>
                          {separator}
                          <Link
                            ref={(element) => {
                              refs.current[index] = element;
                            }}
                            to={item.to}
                            {...common}
                            onClick={() => close(false)}
                          >
                            {content}
                          </Link>
                        </Fragment>
                      );
                    }
                    return (
                      <Fragment key={item.id}>
                        {separator}
                        <button
                          type="button"
                          ref={(element) => {
                            refs.current[index] = element;
                          }}
                          {...common}
                          disabled={logout.isPending}
                          onClick={() => {
                            if (item.action !== 'logout') return;
                            logout.mutate(undefined, {
                              onSettled: () => void navigate('/ingresar', { replace: true }),
                            });
                          }}
                        >
                          {content}
                        </button>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
