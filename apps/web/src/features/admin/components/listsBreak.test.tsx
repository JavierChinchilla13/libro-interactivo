import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderAt } from '../../../test/mockApi';

/**
 * break-ui de cierre: cada lista de la administración con 0, 1, 60 y 500 elementos, con títulos larguísimos y
 * nombres con emoji mezclados. Las listas que el servidor pagina (usuarios, mensajes) se prueban con su paginación.
 */
const ADMIN = {
  id: '670000000000000000000001',
  name: 'Admin',
  email: 'a@ejemplo.com',
  role: 'ADMIN',
};
const stamp = '2026-10-01T10:00:00.000Z';
const BOOK_ID = '670000000000000000000010';
const hex = (n: number) => n.toString(16).padStart(24, '0');
const LONG =
  'La crónica completa de los años en que Aleksandra Wiśniewska-Kowalczyk recorrió las ciudades antiguas buscando el archivo perdido de la biblioteca sumergida';
const label = (i: number) =>
  i % 7 === 0
    ? `${LONG} ${i}`
    : i % 5 === 0
      ? `🌙✨ Noche ${i} — 夜の物語 👩🏽‍🚀`
      : i === 3
        ? 'Jo'
        : `Fila ${i}`;
const image = {
  provider: 'cloudinary',
  publicId: 'x',
  url: 'https://res.cloudinary.com/demo/image/upload/x.jpg',
  width: 10,
  height: 10,
  alt: 'x',
};
const book = {
  id: BOOK_ID,
  slug: 'libro-1',
  title: 'Libro Uno',
  synopsis: '',
  genres: [],
  order: 1,
  status: 'published',
  purchaseLinks: [],
  showInReaderPanel: false,
  wikiSections: [],
  createdAt: stamp,
  updatedAt: stamp,
};

interface Case {
  name: string;
  path: string;
  /** Respuestas simuladas para `n` elementos. */
  handlers: (n: number) => Record<string, () => Response>;
  empty: string;
}

const CASES: Case[] = [
  {
    name: 'libros',
    path: '/admin/libros',
    handlers: (n) => ({
      'GET /api/admin/books': () =>
        json({
          books: Array.from({ length: n }, (_, i) => ({
            ...book,
            id: hex(i + 1),
            slug: `libro-${i + 1}`,
            title: label(i + 1),
            order: i + 1,
          })),
        }),
    }),
    empty: 'Todavía no hay libros',
  },
  {
    name: 'wiki',
    path: '/admin/wiki',
    handlers: (n) => ({
      'GET /api/admin/wiki?kind=character': () =>
        json({
          entries: Array.from({ length: n }, (_, i) => ({
            id: hex(i + 1),
            kind: 'character',
            slug: `p-${i + 1}`,
            name: label(i + 1),
            letter: 'F',
            fields: [],
            links: [],
            lockedDisplay: 'show',
            order: i + 1,
            status: 'published',
            createdAt: stamp,
            updatedAt: stamp,
          })),
        }),
    }),
    empty: 'Todavía no hay entradas en esta pestaña',
  },
  {
    name: 'actualizaciones',
    path: '/admin/actualizaciones',
    handlers: (n) => ({
      'GET /api/admin/posts': () =>
        json({
          posts: Array.from({ length: n }, (_, i) => ({
            id: hex(i + 1),
            slug: `a-${i + 1}`,
            title: label(i + 1),
            template: 'event',
            category: 'evento',
            excerpt: '',
            featured: false,
            status: 'published',
            publishedAt: stamp,
            createdAt: stamp,
            updatedAt: stamp,
            data: { startsAt: stamp, venue: 'Lugar', bodyHtml: '' },
          })),
        }),
    }),
    empty: 'Todavía no hay actualizaciones',
  },
  {
    name: 'fan arts',
    path: '/admin/fan-arts',
    handlers: (n) => ({
      'GET /api/admin/fan-arts': () =>
        json({
          fanArts: Array.from({ length: n }, (_, i) => ({
            id: hex(i + 1),
            title: label(i + 1),
            image,
            artistName: `Artista ${i + 1}`,
            permissionConfirmed: true,
            order: i + 1,
            status: 'published',
            createdAt: stamp,
            updatedAt: stamp,
          })),
        }),
    }),
    empty: 'Todavía no hay fan arts',
  },
  {
    name: 'reseñas',
    path: '/admin/resenas',
    handlers: (n) => ({
      'GET /api/admin/reviews': () =>
        json({
          reviews: Array.from({ length: n }, (_, i) => ({
            id: hex(i + 1),
            text: label(i + 1),
            authorName: `Lectora ${i + 1}`,
            rating: 5,
            order: i + 1,
            status: 'published',
            createdAt: stamp,
            updatedAt: stamp,
          })),
        }),
    }),
    empty: 'Todavía no hay reseñas',
  },
  {
    name: 'capítulos extra',
    path: '/admin/extras',
    handlers: (n) => ({
      'GET /api/admin/books': () => json({ books: [book] }),
      [`GET /api/admin/extras?bookId=${BOOK_ID}`]: () =>
        json({
          extras: Array.from({ length: n }, (_, i) => ({
            id: hex(i + 1),
            bookId: BOOK_ID,
            slug: `e-${i + 1}`,
            title: label(i + 1),
            kind: 'text',
            bodyHtml: '<p>x</p>',
            order: i + 1,
            status: 'published',
            createdAt: stamp,
            updatedAt: stamp,
          })),
        }),
    }),
    empty: 'Este libro todavía no tiene extras',
  },
];

const narrow = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
afterEach(() => vi.unstubAllGlobals());

const rowsOf = (table: HTMLElement) => within(table).getAllByRole('row').length - 1;

describe('break-ui · listas con 0, 1, 60 y 500 elementos', { timeout: 60_000 }, () => {
  for (const item of CASES) {
    describe(item.name, () => {
      it('0: vacío diseñado con su salida, sin tabla', async () => {
        mockApi(item.handlers(0), { session: ADMIN });
        renderAt(item.path);
        expect(await screen.findByText(item.empty)).toBeInTheDocument();
        expect(screen.queryByRole('table')).toBeNull();
        expect(screen.queryByText('Limpiar filtros')).toBeNull();
      });

      it('1: una fila, con su botón «Editar» sin partirse y sin buscador', async () => {
        mockApi(item.handlers(1), { session: ADMIN });
        renderAt(item.path);
        const table = await screen.findByRole('table');
        expect(rowsOf(table)).toBe(1);
        expect(within(table).getByRole('link', { name: /^Editar / })).toHaveClass(
          'admin-edit-link',
        );
        // El buscador del cliente solo aparece con más de 8 filas (actualizaciones tiene el suyo, del servidor).
        if (item.name !== 'actualizaciones') {
          expect(screen.queryByLabelText('Buscar por título')).toBeNull();
        }
      });

      it('60: muestra 50 y ofrece «Mostrar 10 más»; los títulos largos y con emoji no rompen la fila', async () => {
        mockApi(item.handlers(60), { session: ADMIN });
        renderAt(item.path);
        const table = await screen.findByRole('table');
        expect(rowsOf(table)).toBe(50);
        expect(screen.getByText('Mostrando 50 de 60')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Mostrar 10 más' }));
        expect(rowsOf(table)).toBe(60);
        expect(table.textContent).toContain('🌙');
        expect(table.textContent).toContain('Aleksandra Wiśniewska-Kowalczyk');
      });

      it('500: solo dibuja 50 filas y se puede seguir de 50 en 50', async () => {
        mockApi(item.handlers(500), { session: ADMIN });
        renderAt(item.path);
        const table = await screen.findByRole('table');
        expect(rowsOf(table)).toBe(50);
        expect(screen.getByRole('button', { name: 'Mostrar 50 más' })).toBeInTheDocument();
      });

      it('en celular (tarjetas): 60 elementos no dibujan tabla y cada tarjeta tiene su «Editar»', async () => {
        narrow();
        mockApi(item.handlers(60), { session: ADMIN });
        renderAt(item.path);
        const list = await screen.findByRole('list', { name: new RegExp('.+') });
        expect(screen.queryByRole('table')).toBeNull();
        const cards = within(list).getAllByRole('listitem');
        expect(cards).toHaveLength(50);
        expect(within(cards[0]!).getByRole('link', { name: /^Editar / })).toHaveClass(
          'admin-row-action',
        );
      });
    });
  }

  describe('usuarios (paginados por el servidor)', () => {
    const users = (n: number) => ({
      'GET /api/admin/users?page=1': () =>
        json({
          users: Array.from({ length: Math.min(n, 20) }, (_, i) => ({
            id: hex(i + 1),
            name: label(i + 1),
            email: `masivo-${i + 1}-con-un-correo-bastante-largo@ejemplo-institucion-universitaria.example.com`,
            role: 'USER',
            status: 'active',
            createdAt: stamp,
            completedQuizzes: 0,
          })),
          total: n,
          page: 1,
          pageSize: 20,
          totalQuizzes: 3,
        }),
    });

    it('0: «Todavía no hay personas»', async () => {
      mockApi(users(0), { session: ADMIN });
      renderAt('/admin/usuarios');
      expect(await screen.findByText('Todavía no hay personas')).toBeInTheDocument();
    });

    it('1: una persona y sin paginación', async () => {
      mockApi(users(1), { session: ADMIN });
      renderAt('/admin/usuarios');
      expect(rowsOf(await screen.findByRole('table'))).toBe(1);
      expect(screen.queryByRole('navigation', { name: 'Páginas' })).toBeNull();
    });

    it.each([60, 500])(
      '%i: 20 por página con «Página 1 de N» y correo largo sin romper la fila',
      async (n) => {
        mockApi(users(n), { session: ADMIN });
        renderAt('/admin/usuarios');
        const table = await screen.findByRole('table');
        expect(rowsOf(table)).toBe(20);
        expect(
          screen.getByText(`Página 1 de ${Math.ceil(n / 20)} · ${n} personas`),
        ).toBeInTheDocument();
        expect(table.textContent).toContain('masivo-1-con-un-correo-bastante-largo');
      },
    );
  });

  describe('mensajes (paginados por el servidor)', () => {
    const messages = (n: number) => ({
      'GET /api/admin/contact-messages?status=unhandled&page=1': () =>
        json({
          messages: Array.from({ length: Math.min(n, 20) }, (_, i) => ({
            id: hex(i + 1),
            name: label(i + 1),
            email: `persona${i + 1}@ejemplo.com`,
            message: i % 3 === 0 ? `${LONG} ${LONG}` : `Hola ${i + 1} 🌙`,
            createdAt: stamp,
            handled: false,
          })),
          total: n,
          unhandled: n,
          page: 1,
          pageSize: 20,
        }),
    });

    it('0: «No hay mensajes sin atender»', async () => {
      mockApi(messages(0), { session: ADMIN });
      renderAt('/admin/mensajes');
      expect(await screen.findByText('No hay mensajes sin atender')).toBeInTheDocument();
    });

    it('1: un mensaje y sin paginación', async () => {
      mockApi(messages(1), { session: ADMIN });
      renderAt('/admin/mensajes');
      const list = await screen.findByRole('list', { name: 'Mensajes' });
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
      expect(screen.queryByRole('navigation', { name: 'Páginas' })).toBeNull();
    });

    it.each([60, 500])(
      '%i: 20 por página y «Página 1 de N»; el texto largo se parte, no ensancha',
      async (n) => {
        mockApi(messages(n), { session: ADMIN });
        renderAt('/admin/mensajes');
        const list = await screen.findByRole('list', { name: 'Mensajes' });
        expect(within(list).getAllByRole('listitem')).toHaveLength(20);
        expect(screen.getByText(`Página 1 de ${Math.ceil(n / 20)}`)).toBeInTheDocument();
      },
    );
  });
});
