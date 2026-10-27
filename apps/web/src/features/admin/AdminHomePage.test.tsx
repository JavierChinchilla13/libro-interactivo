import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { json, mockApi, renderAt } from '../../test/mockApi';

const ADMIN = {
  id: '670000000000000000000001',
  name: 'Marisol Quesada',
  email: 'm@ejemplo.com',
  role: 'ADMIN',
};
const EDITOR = { ...ADMIN, id: '670000000000000000000002', role: 'EDITOR' };
const BOOK_ID = '670000000000000000000010';
const stamp = '2026-10-01T10:00:00.000Z';
const DAY = 86_400_000;

const book = (over: object = {}) => ({
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
  ...over,
});
const quiz = (n: number, over: object = {}) => ({
  id: `67000000000000000000002${n}`,
  bookId: BOOK_ID,
  slug: `quiz-${n}`,
  order: n,
  title: `Quiz ${n}`,
  status: 'published',
  currentVersion: 1,
  allowRetake: true,
  showBreakdown: false,
  updatedAt: stamp,
  hasUnpublishedChanges: false,
  ...over,
});
const settings = (headerImages: object[] = []) => ({
  welcome: { enabled: false, bodyHtml: '', showMode: 'every_login' },
  universe: { headline: '[PLACEHOLDER]', introHtml: '', headerImages },
  author: { bioHtml: '' },
  social: [],
  lock: { message: '[PLACEHOLDER]' },
});
const stats = (over: object = {}) => ({
  readers: { total: 12, last7Days: 3, last30Days: 8, disabled: 0 },
  staff: 2,
  attempts: { completed: 30, inProgress: 4 },
  booksCompleted: 5,
  unhandledMessages: 3,
  quizzes: [],
  ...over,
});

const empty = {
  'GET /api/admin/books': () => json({ books: [] }),
  'GET /api/admin/fan-arts?status=draft': () => json({ fanArts: [] }),
  'GET /api/admin/posts?status=draft': () => json({ posts: [] }),
  'GET /api/admin/site-settings': () => json(settings()),
  'GET /api/admin/stats': () =>
    json(
      stats({
        readers: { total: 0, last7Days: 0, last30Days: 0, disabled: 0 },
        attempts: { completed: 0, inProgress: 0 },
        unhandledMessages: 0,
      }),
    ),
  'GET /api/admin/access-tokens': () => json({ tokens: [] }),
  'GET /api/admin/contact-messages?status=unhandled': () =>
    json({ messages: [], total: 0, unhandled: 0, page: 1, pageSize: 20 }),
};

const withData = {
  ...empty,
  'GET /api/admin/books': () =>
    json({
      books: [
        book(),
        book({
          id: '670000000000000000000011',
          title: 'Libro Dos',
          status: 'upcoming',
          releaseDate: new Date(Date.now() + 12 * DAY - 3_600_000).toISOString(),
        }),
      ],
    }),
  [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () =>
    json({
      quizzes: [
        quiz(1),
        quiz(2, { hasUnpublishedChanges: true }),
        quiz(3, { status: 'draft', currentVersion: 0, hasUnpublishedChanges: true }),
        quiz(4, { status: 'archived' }),
      ],
    }),
  'GET /api/admin/quizzes?bookId=670000000000000000000011': () => json({ quizzes: [] }),
  'GET /api/admin/fan-arts?status=draft': () =>
    json({
      fanArts: [1, 2].map((n) => ({
        id: `67000000000000000000003${n}`,
        artistName: `Artista ${n}`,
        permissionConfirmed: false,
        order: n,
        status: 'draft',
        image: {
          provider: 'cloudinary',
          publicId: 'x',
          url: 'https://res.cloudinary.com/demo/x.jpg',
          alt: 'x',
          width: 10,
          height: 10,
        },
        createdAt: stamp,
        updatedAt: stamp,
      })),
    }),
  'GET /api/admin/stats': () => json(stats()),
  'GET /api/admin/contact-messages?status=unhandled': () =>
    json({ messages: [], total: 3, unhandled: 3, page: 1, pageSize: 20 }),
};

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

const main = () => screen.getByRole('main');

describe('inicio de la administración · cuenta vacía', () => {
  it('saluda por el nombre, dice «Todo al día» y guía con los primeros pasos', async () => {
    mockApi(empty, { session: ADMIN });
    renderAt('/admin');
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /^Buen(os|as) (días|tardes|noches), Marisol$/,
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
    const steps = await screen.findByRole('region', { name: 'Primeros pasos' });
    expect(within(steps).getByText(/0 de 5 listos/)).toBeInTheDocument();
    expect(within(steps).getByRole('link', { name: 'Crea tu primer libro' })).toHaveAttribute(
      'href',
      '/admin/libros/nuevo',
    );
    expect(within(main()).getByText('Resumen en números')).toBeInTheDocument();
  });

  it('«Ocultar» esconde los primeros pasos y se acuerda', async () => {
    mockApi(empty, { session: ADMIN });
    const { unmount } = renderAt('/admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Ocultar' }));
    expect(screen.queryByRole('region', { name: 'Primeros pasos' })).toBeNull();
    unmount();
    renderAt('/admin');
    await screen.findByText('Todo al día');
    expect(screen.queryByRole('region', { name: 'Primeros pasos' })).toBeNull();
  });
});

describe('inicio de la administración · cuenta con datos', () => {
  it('lista lo que necesita atención con enlace directo, sin contar los archivados', async () => {
    mockApi(withData, { session: ADMIN });
    renderAt('/admin');
    await screen.findByRole('link', { name: '3 mensajes sin atender' });
    expect(screen.getByRole('link', { name: '3 mensajes sin atender' })).toHaveAttribute(
      'href',
      '/admin/mensajes',
    );
    expect(
      screen.getByRole('link', { name: '1 quiz con cambios sin publicar' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1 quiz en borrador' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2 fan arts en borrador' })).toHaveAttribute(
      'href',
      '/admin/fan-arts',
    );
    expect(screen.getByRole('link', { name: 'Libro Dos sale en 12 días' })).toHaveAttribute(
      'href',
      '/admin/libros/670000000000000000000011',
    );
    expect(screen.queryByText('Todo al día')).toBeNull();
  });

  it('resume en números y marca solos los pasos hechos', async () => {
    mockApi(withData, { session: ADMIN });
    renderAt('/admin');
    await waitFor(() => expect(screen.getByTestId('stat-published-books')).toHaveTextContent('1'));
    expect(screen.getByText('de 2 en total')).toBeInTheDocument();
    expect(await screen.findByText('de 3 sin contar los archivados')).toBeInTheDocument();
    expect(await screen.findByText('3 nuevas en 7 días')).toBeInTheDocument();
    const steps = await screen.findByRole('region', { name: 'Primeros pasos' });
    expect(within(steps).getByText(/3 de 5 listos/)).toBeInTheDocument();
    expect(within(steps).queryByRole('link', { name: 'Crea tu primer libro' })).toBeNull();
    expect(within(steps).getByRole('link', { name: 'Genera el código QR' })).toBeInTheDocument();
  });

  it('el menú lleva insignias de conteo en Mensajes y Fan arts', async () => {
    mockApi(withData, { session: ADMIN });
    renderAt('/admin');
    const menu = await screen.findByRole('navigation', { name: 'Administración' });
    expect(await within(menu).findByRole('link', { name: /Mensajes/ })).toHaveTextContent('3');
    expect(within(menu).getByRole('link', { name: /Mensajes.*3 sin atender/ })).toBeInTheDocument();
    expect(
      await within(menu).findByRole('link', { name: /Fan arts.*2 en borrador/ }),
    ).toBeInTheDocument();
  });
});

describe('inicio de la administración · editora', () => {
  it('no pide ni muestra mensajes, lectoras ni códigos QR, y sus pasos son cuatro', async () => {
    const { called } = mockApi(withData, { session: EDITOR });
    renderAt('/admin');
    await screen.findByRole('link', { name: '1 quiz con cambios sin publicar' });
    expect(screen.queryByRole('link', { name: /mensajes? sin atender/ })).toBeNull();
    expect(screen.queryByText('Lectoras')).toBeNull();
    expect(screen.queryByRole('link', { name: /Ver códigos QR/ })).toBeNull();
    const steps = await screen.findByRole('region', { name: 'Primeros pasos' });
    expect(within(steps).getByText(/de 4 listos/)).toBeInTheDocument();
    expect(called('GET /api/admin/stats')).toHaveLength(0);
    expect(called('GET /api/admin/access-tokens')).toHaveLength(0);
    expect(called('GET /api/admin/contact-messages?status=unhandled')).toHaveLength(0);
  });

  it('un fallo al cargar los libros se explica y deja reintentar', async () => {
    let fail = true;
    mockApi(
      {
        ...empty,
        'GET /api/admin/books': () =>
          fail ? json({ error: { code: 'INTERNAL', message: 'x' } }, 500) : json({ books: [] }),
      },
      { session: ADMIN },
    );
    renderAt('/admin');
    expect(
      await screen.findByText('No pudimos cargar el inicio', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todo al día')).toBeInTheDocument();
  });
});
