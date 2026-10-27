import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockApi, renderAt } from '../../../test/mockApi';
import { DataList, type Column } from './DataList';
import { ListPage } from './ListPage';

const ADMIN = {
  id: '670000000000000000000001',
  name: 'Admin',
  email: 'a@ejemplo.com',
  role: 'ADMIN',
};
const BOOK_ID = '670000000000000000000010';
const stamp = '2026-10-01T10:00:00.000Z';

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
const quiz = (n: number, title = `Quiz ${n}`, over: object = {}) => ({
  id: n.toString(16).padStart(24, '0'),
  bookId: BOOK_ID,
  slug: `quiz-${n}`,
  order: n,
  title,
  status: 'published',
  currentVersion: 1,
  allowRetake: true,
  showBreakdown: false,
  updatedAt: stamp,
  hasUnpublishedChanges: false,
  ...over,
});
const quizzesKey = `GET /api/admin/quizzes?bookId=${BOOK_ID}`;
const base = (quizzes: object[]) => ({
  'GET /api/admin/books': () => json({ books: [book] }),
  [quizzesKey]: () => json({ quizzes }),
});

function narrow() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}
afterEach(() => vi.unstubAllGlobals());

const LONG =
  'La crónica completa de los años en que Aleksandra Wiśniewska-Kowalczyk recorrió las ciudades antiguas buscando el archivo perdido de la biblioteca sumergida';
const EMOJI = '🌙✨ Noche de luna — 夜の物語 👩🏽‍🚀';

describe('listas de la administración (patrón único)', { timeout: 30_000 }, () => {
  it('con cero libros «Nuevo quiz» queda deshabilitado con su motivo y el vacío lleva a crear el libro', async () => {
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: ADMIN });
    renderAt('/admin/quizzes');
    expect(await screen.findByText('Crea un libro antes de agregar quizzes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Nuevo quiz' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: '+ Nuevo quiz' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Crear libro' })).toHaveAttribute(
      'href',
      '/admin/libros/nuevo',
    );
  });

  it('con 0 elementos distingue «todavía no hay nada» y ofrece crear el primero', async () => {
    mockApi(base([]), { session: ADMIN });
    renderAt('/admin/quizzes');
    expect(await screen.findByText('Este libro todavía no tiene quizzes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear el primer quiz' })).toHaveAttribute(
      'href',
      `/admin/quizzes/nuevo?libro=${BOOK_ID}`,
    );
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Limpiar filtros')).toBeNull();
  });

  it('con un filtro activo y sin resultados dice «ningún resultado» y deja limpiar el filtro', async () => {
    const calls: string[] = [];
    mockApi(
      {
        'GET /api/admin/books': () => json({ books: [book] }),
        [quizzesKey]: () => json({ quizzes: [quiz(1)] }),
        [`${quizzesKey}&status=archived`]: () => {
          calls.push('archived');
          return json({ quizzes: [] });
        },
      },
      { session: ADMIN },
    );
    renderAt('/admin/quizzes');
    await screen.findByRole('table', { name: 'Quizzes' });
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'archived');
    expect(await screen.findByText('Ningún resultado con estos filtros')).toBeInTheDocument();
    expect(screen.queryByText('Este libro todavía no tiene quizzes')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByRole('table', { name: 'Quizzes' })).toBeInTheDocument();
    expect(calls).toEqual(['archived']);
  });

  it('con 1 elemento muestra la tabla con su «Editar» sin partirse y sin buscador', async () => {
    mockApi(base([quiz(1, 'Quiz Uno')]), { session: ADMIN });
    renderAt('/admin/quizzes');
    const table = await screen.findByRole('table', { name: 'Quizzes' });
    const link = within(table).getByRole('link', { name: 'Editar Quiz Uno' });
    expect(link).toHaveClass('admin-edit-link');
    expect(link).toHaveAttribute('href', `/admin/quizzes/${(1).toString(16).padStart(24, '0')}`);
    expect(screen.queryByLabelText('Buscar por título')).toBeNull();
  });

  it('con 60 elementos muestra 50, deja ver más y busca por título', async () => {
    const many = Array.from({ length: 60 }, (_, i) => quiz(i + 1, `Quiz número ${i + 1}`));
    mockApi(base(many), { session: ADMIN });
    renderAt('/admin/quizzes');
    const table = await screen.findByRole('table', { name: 'Quizzes' });
    expect(within(table).getAllByRole('row')).toHaveLength(51);
    expect(screen.getByText('Mostrando 50 de 60')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar 10 más' }));
    expect(within(table).getAllByRole('row')).toHaveLength(61);
    await userEvent.type(screen.getByLabelText('Buscar por título'), 'número 7');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByRole('link', { name: 'Editar Quiz número 7' })).toBeInTheDocument();
  });

  it('con 500 elementos solo dibuja 50 filas', async () => {
    const huge = Array.from({ length: 500 }, (_, i) => quiz(i + 1));
    mockApi(base(huge), { session: ADMIN });
    renderAt('/admin/quizzes');
    const table = await screen.findByRole('table', { name: 'Quizzes' });
    expect(within(table).getAllByRole('row')).toHaveLength(51);
    expect(screen.getByRole('button', { name: 'Mostrar 50 más' })).toBeInTheDocument();
  });

  it('un título larguísimo y uno con emoji no rompen la fila ni el botón «Editar»', async () => {
    mockApi(base([quiz(1, LONG), quiz(2, EMOJI)]), { session: ADMIN });
    renderAt('/admin/quizzes');
    const table = await screen.findByRole('table', { name: 'Quizzes' });
    expect(
      within(table)
        .getAllByText(LONG)
        .some((el) => el.classList.contains('admin-cell-title')),
    ).toBe(true);
    expect(within(table).getByRole('link', { name: `Editar ${EMOJI}` })).toHaveClass(
      'admin-edit-link',
    );
  });

  it('muestra «cambios sin publicar» junto al estado de un quiz publicado', async () => {
    mockApi(base([quiz(1, 'Con cambios', { hasUnpublishedChanges: true }), quiz(2)]), {
      session: ADMIN,
    });
    renderAt('/admin/quizzes');
    const rows = within(await screen.findByRole('table', { name: 'Quizzes' })).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Cambios sin publicar');
    expect(rows[2]).not.toHaveTextContent('Cambios sin publicar');
  });

  it('en el celular son tarjetas (sin tabla) con estado, datos y un «Editar» de ancho completo', async () => {
    narrow();
    mockApi(base([quiz(1, LONG), quiz(2, EMOJI, { status: 'draft', currentVersion: 0 })]), {
      session: ADMIN,
    });
    renderAt('/admin/quizzes');
    const list = await screen.findByRole('list', { name: 'Quizzes' });
    expect(screen.queryByRole('table')).toBeNull();
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getAllByText(LONG).length).toBeGreaterThan(0);
    expect(within(cards[0]!).getByText('Publicado')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Repetir')).toBeInTheDocument();
    expect(within(cards[1]!).getByText('Borrador')).toBeInTheDocument();
    expect(within(cards[1]!).getByRole('link', { name: `Editar ${EMOJI}` })).toHaveClass(
      'admin-row-action',
    );
  });

  it('un error de la lista se explica y «Reintentar» vuelve a pedirla', async () => {
    let fail = true;
    mockApi(
      {
        'GET /api/admin/books': () => json({ books: [book] }),
        [quizzesKey]: () =>
          fail
            ? json({ error: { code: 'INTERNAL', message: 'Falló' } }, 500)
            : json({ quizzes: [quiz(1)] }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/quizzes');
    expect(
      await screen.findByText('No pudimos cargar la lista', {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: 'Quizzes' })).toBeInTheDocument();
  });

  it('mientras carga muestra esqueletos y no un texto «Cargando…» suelto', async () => {
    mockApi(
      {
        'GET /api/admin/books': () => new Promise<Response>(() => undefined) as unknown as Response,
      },
      { session: ADMIN },
    );
    renderAt('/admin/quizzes');
    expect(await screen.findByRole('status', { name: 'Cargando' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByText('Cargando…')).toBeNull();
  });
});

describe('DataList aislada', () => {
  type Row = { id: string; name: string };
  const columns: Column<Row>[] = [
    { id: 'name', header: 'Nombre', role: 'title', cell: (row) => row.name },
  ];
  it('una fila sin acción no dibuja columna de acciones', () => {
    render(
      <MemoryRouter>
        <DataList
          label="Personas"
          rows={[{ id: '1', name: 'Jo' }]}
          rowKey={(r) => r.id}
          columns={columns}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('columnheader', { name: 'Acciones' })).toBeNull();
    expect(screen.getByRole('cell', { name: 'Jo' })).toBeInTheDocument();
  });

  it('ListPage sin filtros activos y sin filas usa el vacío del libro, no el de filtros', () => {
    render(
      <MemoryRouter>
        <ListPage
          title="Cosas"
          state={{ isPending: false, isError: false, error: null, refetch: () => undefined }}
          count={0}
          empty={{ title: 'Aún no hay cosas', text: 'Crea una.' }}
        >
          <p>no se dibuja</p>
        </ListPage>
      </MemoryRouter>,
    );
    expect(screen.getByText('Aún no hay cosas')).toBeInTheDocument();
    expect(screen.queryByText('no se dibuja')).toBeNull();
  });
});
