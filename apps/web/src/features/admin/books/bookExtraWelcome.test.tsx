import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, json, mockApi, renderAt } from '../../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const EDITOR = {
  id: '670000000000000000000002',
  name: 'Editora',
  email: 'e@ejemplo.com',
  role: 'EDITOR',
};
const BOOK_ID = '670000000000000000000010';
const stamp = '2026-10-01T10:00:00.000Z';
const book = (over: object = {}) => ({
  id: BOOK_ID,
  slug: 'libro-1',
  title: 'Libro Uno',
  synopsis: '',
  genres: [],
  order: 1,
  status: 'draft',
  purchaseLinks: [],
  wikiSections: [],
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
});

describe('libros del panel', () => {
  it('crea un libro: valida el título y la portada de lo publicado antes de llamar al API', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        'POST /api/admin/books': ({ body }) => json(book(body as object), 201),
        [`GET /api/admin/books/${BOOK_ID}`]: () => json(book()),
        [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () => json({ quizzes: [] }),
      },
      { session: EDITOR },
    );
    renderAt('/admin/libros/nuevo');
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }));
    expect(called('POST /api/admin/books')).toHaveLength(0);
    await waitFor(() => expect(document.querySelector('[aria-invalid="true"]')).not.toBeNull());

    await userEvent.type(screen.getByRole('textbox', { name: /^Título/ }), 'Libro Uno');
    await userEvent.selectOptions(screen.getByLabelText(/^Estado/), 'published');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    // «Publicado» exige portada: el navegador lo frena igual que el servidor.
    expect((await screen.findAllByText(/necesita portada/)).length).toBeGreaterThan(0);
    expect(called('POST /api/admin/books')).toHaveLength(0);

    await userEvent.selectOptions(screen.getByLabelText(/^Estado/), 'draft');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(called('POST /api/admin/books')).toHaveLength(1));
    expect(called('POST /api/admin/books')[0]?.body).toMatchObject({
      title: 'Libro Uno',
      slug: 'libro-uno',
      status: 'draft',
      order: 1,
    });
  }, 20_000);

  it('edita y reemplaza con PUT conservando lo cargado', async () => {
    const { called } = mockApi(
      {
        [`GET /api/admin/books/${BOOK_ID}`]: () => json(book({ tagline: 'Un lema' })),
        [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () => json({ quizzes: [] }),
        'GET /api/admin/books': () => json({ books: [book()] }),
        [`PUT /api/admin/books/${BOOK_ID}`]: ({ body }) => json(book(body as object)),
      },
      { session: EDITOR },
    );
    renderAt(`/admin/libros/${BOOK_ID}`);
    const title = await screen.findByRole('textbox', { name: /^Título/ });
    expect(title).toHaveValue('Libro Uno');
    await userEvent.clear(title);
    await userEvent.type(title, 'Libro Uno (2.ª edición)');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(called(`PUT /api/admin/books/${BOOK_ID}`)).toHaveLength(1));
    expect(called(`PUT /api/admin/books/${BOOK_ID}`)[0]?.body).toMatchObject({
      title: 'Libro Uno (2.ª edición)',
      tagline: 'Un lema',
      slug: 'libro-1',
    });
  });

  it('muestra el error cuando el libro no existe', async () => {
    mockApi(
      {
        [`GET /api/admin/books/${BOOK_ID}`]: () =>
          apiError('NOT_FOUND', 'Libro no encontrado', 404),
      },
      { session: EDITOR },
    );
    renderAt(`/admin/libros/${BOOK_ID}`);
    expect(await screen.findByText('Libro no encontrado')).toBeInTheDocument();
  });
});

describe('capítulos extra del panel', () => {
  const extra = (over: object = {}) => ({
    id: '670000000000000000000030',
    bookId: BOOK_ID,
    slug: 'capitulo-extra',
    title: 'Capítulo extra 1',
    kind: 'text',
    bodyHtml: '<p>Hola</p>',
    order: 1,
    status: 'published',
    createdAt: stamp,
    updatedAt: stamp,
    ...over,
  });

  it('lista con tipo y estado, y enlaza a editar', async () => {
    mockApi(
      {
        'GET /api/admin/books': () => json({ books: [book()] }),
        [`GET /api/admin/extras?bookId=${BOOK_ID}`]: () =>
          json({
            extras: [
              extra(),
              extra({ id: '2'.padStart(24, '0'), title: 'Archivo', kind: 'pdf', status: 'draft' }),
            ],
          }),
      },
      { session: EDITOR },
    );
    renderAt('/admin/extras');
    expect(
      await screen.findByRole('row', { name: /Capítulo extra 1.*Publicado/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Archivo.*Borrador/ })).toBeInTheDocument();
    const links = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(links).toContain('/admin/extras/670000000000000000000030');
  });

  it('sin extras lo dice, y sin libros invita a crear uno', async () => {
    mockApi(
      {
        'GET /api/admin/books': () => json({ books: [book()] }),
        [`GET /api/admin/extras?bookId=${BOOK_ID}`]: () => json({ extras: [] }),
      },
      { session: EDITOR },
    );
    const first = renderAt('/admin/extras');
    expect(await screen.findByText('Este libro todavía no tiene extras')).toBeInTheDocument();
    first.unmount();
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: EDITOR });
    renderAt('/admin/extras');
    expect(await screen.findByText('Primero crea un libro')).toBeInTheDocument();
  });
});

describe('mensaje de bienvenida del panel', () => {
  const settings = (welcome: object) => ({
    welcome,
    universe: { introHtml: '' },
    author: { bioHtml: '' },
    social: [],
    lock: {},
  });

  it('carga lo guardado, guarda solo la sección de bienvenida y avisa', async () => {
    const { called } = mockApi(
      {
        'GET /api/admin/site-settings': () =>
          json(
            settings({
              enabled: true,
              showMode: 'first_login',
              title: 'Hola',
              bodyHtml: '<p>Bienvenida</p>',
            }),
          ),
        'PATCH /api/admin/site-settings': ({ body }) =>
          json(settings((body as { welcome: object }).welcome)),
      },
      { session: EDITOR },
    );
    renderAt('/admin/bienvenida');
    const title = await screen.findByRole('textbox', { name: 'Título' });
    expect(title).toHaveValue('Hola');
    expect(screen.getByLabelText(/Mostrar el mensaje de bienvenida/)).toBeChecked();
    await userEvent.clear(title);
    await userEvent.type(title, 'Bienvenida nueva');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    expect(called('PATCH /api/admin/site-settings')[0]?.body).toMatchObject({
      welcome: { enabled: true, showMode: 'first_login', title: 'Bienvenida nueva' },
    });
    expect(Object.keys(called('PATCH /api/admin/site-settings')[0]?.body as object)).toEqual([
      'welcome',
    ]);
  });

  it('si el servidor rechaza activar el mensaje sin texto, muestra el motivo', async () => {
    mockApi(
      {
        'GET /api/admin/site-settings': () =>
          json(settings({ enabled: false, showMode: 'every_login', bodyHtml: '' })),
        'PATCH /api/admin/site-settings': () =>
          apiError('VALIDATION', 'Escribe el mensaje antes de activarlo', 400),
      },
      { session: EDITOR },
    );
    renderAt('/admin/bienvenida');
    await userEvent.click(await screen.findByLabelText(/Mostrar el mensaje de bienvenida/));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribe el mensaje antes de activarlo')).toBeInTheDocument();
    expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument();
  });
});
