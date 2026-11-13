import type { AuthUser } from '@libro/shared';
import type { AdminIconName } from '../../shared/ui/adminIcons';

type Role = AuthUser['role'];

/**
 * Definición única del menú de administración: alimenta el menú lateral, el cajón del celular, las migas, el título
 * del documento y (en el inicio) las acciones rápidas. Agregar una pantalla = una entrada nueva aquí.
 * El menú solo oculta lo que una cuenta no puede usar; quien decide los permisos es el servidor.
 */
export interface AdminNavItem {
  id: string;
  label: string;
  to: string;
  icon: AdminIconName;
  /** Una línea en lenguaje simple: qué se hace en esta pantalla. */
  description: string;
  /** Sin `roles`, los editores y los administradores. */
  roles?: readonly Role[];
}

export interface AdminNavGroup {
  id: string;
  /** Sin título, el grupo va suelto arriba del menú (Inicio). */
  label?: string;
  items: readonly AdminNavItem[];
}

const ADMIN: readonly Role[] = ['ADMIN'];

export const ADMIN_HOME: AdminNavItem = {
  id: 'inicio',
  label: 'Inicio',
  to: '/admin',
  icon: 'home',
  description: 'Qué necesita tu atención hoy y por dónde seguir.',
};

export const ADMIN_NAV: readonly AdminNavGroup[] = [
  { id: 'inicio', items: [ADMIN_HOME] },
  {
    id: 'libros-y-quizzes',
    label: 'Mis libros y quizzes',
    items: [
      {
        id: 'libros',
        label: 'Libros',
        to: '/admin/libros',
        icon: 'book',
        description: 'Tus libros: portada, tema y si ya se ven en la web.',
      },
      {
        id: 'quizzes',
        label: 'Quizzes',
        to: '/admin/quizzes',
        icon: 'quiz',
        description: 'Preguntas, resultados, apariencia y versiones de cada quiz.',
      },
    ],
  },
  {
    id: 'contenido',
    label: 'Contenido del universo',
    items: [
      {
        id: 'wiki',
        label: 'Wiki',
        to: '/admin/wiki',
        icon: 'wiki',
        description: 'Personajes, campos y poderes, lugares y glosario.',
      },
      {
        id: 'cartas',
        // El nombre lo cambia la autora (ajustes del sitio): este es el de siempre; el menú usa el suyo.
        label: 'Hallazgos',
        to: '/admin/cartas',
        icon: 'card',
        description: 'Cartas con QR: imágenes que se abren al escanear su código.',
        roles: ADMIN,
      },
      {
        id: 'extras',
        label: 'Capítulos extra',
        to: '/admin/extras',
        icon: 'extra',
        description: 'Textos y recursos que se abren al terminar un libro.',
      },
      {
        id: 'actualizaciones',
        label: 'Actualizaciones',
        to: '/admin/actualizaciones',
        icon: 'news',
        description: 'Noticias y avisos para los lectores.',
      },
    ],
  },
  {
    id: 'comunidad',
    label: 'Comunidad',
    items: [
      {
        id: 'fan-arts',
        label: 'Fan arts',
        to: '/admin/fan-arts',
        icon: 'art',
        description: 'Obras de la comunidad: revisar, publicar o quitar.',
      },
      {
        id: 'resenas',
        label: 'Reseñas',
        to: '/admin/resenas',
        icon: 'review',
        description: 'Opiniones de los lectores: revisar y publicar.',
      },
      {
        id: 'mensajes',
        label: 'Mensajes',
        to: '/admin/mensajes',
        icon: 'mail',
        description: 'Lo que escriben desde el formulario de contacto.',
        roles: ADMIN,
      },
      {
        id: 'avisos',
        label: 'Avisos por correo',
        to: '/admin/avisos',
        icon: 'send',
        description: 'Los correos de novedades a los lectores apuntados: cómo va cada envío.',
        roles: ADMIN,
      },
    ],
  },
  {
    id: 'pagina',
    label: 'La página',
    items: [
      {
        id: 'sitio',
        label: 'Portada y autora',
        to: '/admin/sitio',
        icon: 'cover',
        description: 'Imágenes de cabecera y la presentación de la autora.',
      },
      {
        id: 'bienvenida',
        label: 'Mensaje de bienvenida',
        to: '/admin/bienvenida',
        icon: 'hand',
        description: 'Lo primero que lee un lector al iniciar sesión.',
      },
      {
        id: 'ajustes',
        label: 'Contacto del sitio',
        to: '/admin/ajustes',
        icon: 'contact',
        description:
          'A dónde llegan los mensajes de contacto, cuánto se guardan y el nombre legal de la titular.',
        roles: ADMIN,
      },
    ],
  },
  {
    id: 'administracion',
    label: 'Administración',
    items: [
      {
        id: 'usuarios',
        label: 'Usuarios',
        to: '/admin/usuarios',
        icon: 'users',
        description: 'Cuentas de lectores y del equipo.',
        roles: ADMIN,
      },
      {
        id: 'qr',
        label: 'Códigos QR',
        to: '/admin/qr',
        icon: 'qr',
        description: 'Un código por quiz y uno para el juego, para imprimir en el libro.',
        roles: ADMIN,
      },
      {
        id: 'estadisticas',
        label: 'Estadísticas',
        to: '/admin/estadisticas',
        icon: 'chart',
        description: 'Lectores, intentos y resultados.',
        roles: ADMIN,
      },
      {
        id: 'respaldo',
        label: 'Respaldo',
        to: '/admin/respaldo',
        icon: 'archive',
        description: 'Descarga una copia cifrada de toda la base de datos del sitio.',
        roles: ADMIN,
      },
    ],
  },
];

const canSee = (item: AdminNavItem, role: Role | undefined) =>
  !item.roles || (role !== undefined && item.roles.includes(role));

/** Nombres que cambian por elemento del menú (`id` → nombre): hoy, el de la sección de cartas. */
export type NavLabels = Readonly<Record<string, string | undefined>>;
const labelOf = (item: AdminNavItem, labels?: NavLabels) => labels?.[item.id] ?? item.label;

/** El menú de una cuenta: sin elementos que no puede usar y sin grupos que quedan vacíos. */
export function navForRole(role: Role | undefined, labels?: NavLabels): AdminNavGroup[] {
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => canSee(item, role))
      .map((item) => ({ ...item, label: labelOf(item, labels) })),
  })).filter((group) => group.items.length > 0);
}

export interface AdminCrumb {
  label: string;
  /** La última miga (la pantalla actual) no lleva destino. */
  to?: string;
}

interface Located {
  group: AdminNavGroup;
  item: AdminNavItem;
}

/** Elemento del menú al que pertenece una ruta (`/admin/quizzes/123` → Quizzes). */
export function locate(pathname: string): Located | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  let found: Located | null = null;
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      const inside =
        item.to === '/admin'
          ? path === '/admin'
          : path === item.to || path.startsWith(`${item.to}/`);
      if (inside && (!found || item.to.length > found.item.to.length)) found = { group, item };
    }
  }
  return found;
}

/** La cuenta propia del equipo (no es un elemento del menú: se llega desde el menú de usuario). */
export const ADMIN_ACCOUNT_PATH = '/admin/cuenta';
export const isAdminAccount = (pathname: string) =>
  pathname.replace(/\/+$/, '') === ADMIN_ACCOUNT_PATH;

/** Texto de la última miga cuando la pantalla no dice otro: «nuevo» o «nueva» en las altas, «Editar» en lo demás. */
function leafLabel(pathname: string, parent: AdminNavItem): string | null {
  const rest = pathname.replace(/\/+$/, '').slice(parent.to.length).replace(/^\//, '');
  if (!rest) return null;
  if (rest === 'nuevo') return 'Nuevo';
  if (rest === 'nueva') return 'Nueva';
  return 'Editar';
}

/** Migas de una ruta: «Grupo › Pantalla › Detalle». Inicio no lleva migas. `leaf` pone el nombre real del detalle. */
export function crumbsFor(
  pathname: string,
  leaf?: string | null,
  labels?: NavLabels,
): AdminCrumb[] {
  if (isAdminAccount(pathname)) return [{ label: 'Mi cuenta' }];
  const where = locate(pathname);
  if (!where || where.item.id === 'inicio') return [];
  const crumbs: AdminCrumb[] = [];
  if (where.group.label) crumbs.push({ label: where.group.label });
  const last = leaf ?? leafLabel(pathname, where.item);
  const name = labelOf(where.item, labels);
  crumbs.push(last ? { label: name, to: where.item.to } : { label: name });
  if (last) crumbs.push({ label: last });
  return crumbs;
}

/** Título del documento: «Quizzes · Administración · Universo Memorias». */
export function documentTitle(pathname: string, labels?: NavLabels): string {
  if (isAdminAccount(pathname)) return 'Mi cuenta · Administración · Universo Memorias';
  const where = locate(pathname);
  const name = where ? labelOf(where.item, labels) : 'Administración';
  return where?.item.id === 'inicio' || !where
    ? 'Administración · Universo Memorias'
    : `${name} · Administración · Universo Memorias`;
}
