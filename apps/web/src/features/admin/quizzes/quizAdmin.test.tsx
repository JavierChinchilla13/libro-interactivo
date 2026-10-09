import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, json, mockApi, renderAt } from '../../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const ADMIN = {
  id: '670000000000000000000003',
  name: 'Autora',
  email: 'a@ejemplo.com',
  role: 'ADMIN',
};
const BOOK_ID = '670000000000000000000010';
const QUIZ_ID = '670000000000000000000020';
const stamp = '2026-10-01T10:00:00.000Z';

const book = (over: object = {}) => ({
  id: BOOK_ID,
  slug: 'libro-1',
  title: 'Libro Uno',
  synopsis: '',
  genres: [],
  order: 1,
  status: 'published',
  purchaseLinks: [],
  wikiSections: [],
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
});
const summary = (over: object = {}) => ({
  id: QUIZ_ID,
  bookId: BOOK_ID,
  slug: 'quiz-1',
  order: 1,
  title: 'Quiz Uno',
  status: 'draft',
  currentVersion: 0,
  allowRetake: true,
  showBreakdown: false,
  updatedAt: stamp,
  ...over,
});
const draft = (over: object = {}) => ({
  title: 'Quiz Uno',
  instructionsHtml: '',
  settings: { allowRetake: true, showBreakdown: false },
  stages: [],
  results: [],
  ...over,
});
const detail = (over: object = {}) => ({
  ...summary(),
  draft: draft(),
  hasUnpublishedChanges: true,
  ...over,
});

const books = { 'GET /api/admin/books': () => json({ books: [book()] }) };

describe('listado de quizzes', () => {
  it('lista por libro con estado, regla de repetir y versión, y pide el filtro al servidor', async () => {
    const { called } = mockApi(
      {
        ...books,
        [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () =>
          json({
            quizzes: [
              summary(),
              summary({
                id: '2'.padStart(24, '0'),
                order: 2,
                title: 'Quiz Dos',
                status: 'published',
                currentVersion: 3,
                allowRetake: false,
              }),
            ],
          }),
        [`GET /api/admin/quizzes?bookId=${BOOK_ID}&status=published`]: () =>
          json({
            quizzes: [summary({ title: 'Quiz Dos', status: 'published', currentVersion: 3 })],
          }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/quizzes');
    expect(
      await screen.findByRole('row', { name: /1.*Quiz Uno.*Borrador.*Sí.*—/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: /2.*Quiz Dos.*Publicado.*No \(una sola vez\).*v3/ }),
    ).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'published');
    await waitFor(() =>
      expect(called(`GET /api/admin/quizzes?bookId=${BOOK_ID}&status=published`)).toHaveLength(1),
    );
  });

  it('sin libros invita a crear uno; sin quizzes avisa', async () => {
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: ADMIN });
    const { unmount } = renderAt('/admin/quizzes');
    expect(await screen.findByText('Primero crea un libro')).toBeInTheDocument();
    unmount();
    mockApi(
      { ...books, [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () => json({ quizzes: [] }) },
      { session: ADMIN },
    );
    renderAt('/admin/quizzes');
    expect(await screen.findByText('Este libro todavía no tiene quizzes')).toBeInTheDocument();
  });

  it('muestra el error del servidor', async () => {
    mockApi(
      {
        ...books,
        [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () =>
          apiError('FORBIDDEN', 'No tienes permiso para realizar esta acción', 403),
      },
      { session: ADMIN },
    );
    renderAt('/admin/quizzes');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('nuevo quiz', () => {
  it('genera el slug del título, valida antes de llamar y crea con las reglas elegidas', async () => {
    const { called } = mockApi(
      {
        ...books,
        'POST /api/admin/quizzes': ({ body }) =>
          json(detail({ title: (body as { title: string }).title }), 201),
        [`GET /api/admin/quizzes/${QUIZ_ID}`]: () => json(detail()),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/quizzes/nuevo?libro=${BOOK_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Crear quiz' }));
    expect(called('POST /api/admin/quizzes')).toHaveLength(0);
    await userEvent.type(screen.getByRole('textbox', { name: /^Título/ }), '¿Qué poder tienes?');
    expect(screen.getByLabelText(/Dirección \(slug\)/)).toHaveValue('que-poder-tienes');
    await userEvent.click(screen.getByLabelText(/Se puede repetir/));
    await userEvent.click(screen.getByRole('button', { name: 'Crear quiz' }));
    await waitFor(() => expect(called('POST /api/admin/quizzes')).toHaveLength(1));
    expect(called('POST /api/admin/quizzes')[0]?.body).toMatchObject({
      bookId: BOOK_ID,
      slug: 'que-poder-tienes',
      order: 1,
      title: '¿Qué poder tienes?',
      settings: { allowRetake: false, showBreakdown: false },
    });
  });

  it('muestra el conflicto cuando la dirección ya existe', async () => {
    mockApi(
      {
        ...books,
        'POST /api/admin/quizzes': () =>
          apiError('CONFLICT', 'Ya existe un quiz con esa dirección', 409),
      },
      { session: ADMIN },
    );
    renderAt('/admin/quizzes/nuevo');
    await userEvent.type(await screen.findByRole('textbox', { name: /^Título/ }), 'Repetido');
    await userEvent.click(screen.getByRole('button', { name: 'Crear quiz' }));
    expect(await screen.findByText('Ya existe un quiz con esa dirección')).toBeInTheDocument();
  });
});

describe('editor de quizzes', () => {
  const url = `/api/admin/quizzes/${QUIZ_ID}`;

  it('carga el borrador y no deja guardar hasta que hay cambios', async () => {
    mockApi({ [`GET ${url}`]: () => json(detail()) }, { session: ADMIN });
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    expect(await screen.findByRole('heading', { name: 'Quiz Uno' })).toBeInTheDocument();
    expect(screen.getByText('Nunca publicado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: /^Título/ }), ' 2');
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeEnabled();
  });

  it('guarda el borrador con PUT y avisa', async () => {
    const { called } = mockApi(
      {
        [`GET ${url}`]: () => json(detail()),
        [`PUT ${url}/draft`]: ({ body }) =>
          json(detail({ draft: body as object, title: 'Quiz Uno 2' })),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await userEvent.type(await screen.findByRole('textbox', { name: /^Título/ }), ' 2');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Borrador guardado.')).toBeInTheDocument();
    expect(called(`PUT ${url}/draft`)[0]?.body).toMatchObject({ title: 'Quiz Uno 2' });
  });

  it('publicar guarda, valida y publica; si hay errores no publica y los muestra', async () => {
    let valid = false;
    const { called } = mockApi(
      {
        [`GET ${url}`]: () => json(detail()),
        [`POST ${url}/validate`]: () =>
          json(
            valid
              ? { valid: true, errors: [], warnings: [{ code: 'W', message: 'Falta una imagen' }] }
              : {
                  valid: false,
                  errors: [{ code: 'E', message: 'La etapa 1 no tiene preguntas' }],
                  warnings: [],
                },
          ),
        [`POST ${url}/publish`]: () =>
          json(
            {
              quizId: QUIZ_ID,
              version: 2,
              publishedAt: stamp,
              warnings: [{ code: 'W', message: 'Falta una imagen' }],
            },
            201,
          ),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText(/1 error \(impiden publicar\)/)).toBeInTheDocument();
    expect(screen.getByText('La etapa 1 no tiene preguntas')).toBeInTheDocument();
    expect(called(`POST ${url}/publish`)).toHaveLength(0);

    valid = true;
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(await screen.findByText('Publicada como versión 2.')).toBeInTheDocument();
    expect(screen.getByText('Falta una imagen')).toBeInTheDocument();
    expect(called(`POST ${url}/publish`)).toHaveLength(1);
  });

  it('la vista previa exige haber publicado al menos una vez', async () => {
    mockApi({ [`GET ${url}`]: () => json(detail()) }, { session: ADMIN });
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Vista previa' }));
    expect(
      await screen.findByText('Publica el quiz al menos una vez para poder probarlo.'),
    ).toBeInTheDocument();
  });

  it('un quiz archivado no se puede editar ni publicar', async () => {
    mockApi(
      { [`GET ${url}`]: () => json(detail({ status: 'archived', currentVersion: 1 })) },
      { session: ADMIN },
    );
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    expect(await screen.findByText('Este quiz está archivado')).toBeInTheDocument();
    for (const name of ['Guardar borrador', 'Validar', 'Publicar', 'Vista previa']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('el borrador permite agregar una etapa con su pregunta y un resultado', async () => {
    mockApi({ [`GET ${url}`]: () => json(detail()) }, { session: ADMIN });
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz Uno' });
    await userEvent.click(screen.getByRole('tab', { name: 'Etapas y preguntas' }));
    const panel = screen.getByRole('tabpanel');
    await userEvent.click(
      within(panel).getByRole('button', { name: /Agregar etapa|Nueva etapa|\+ Etapa/i }),
    );
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Resultados' }));
    await userEvent.click(
      within(screen.getByRole('tabpanel')).getByRole('button', {
        name: /Agregar resultado|Nuevo resultado|\+ Resultado/i,
      }),
    );
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
  });

  it('muestra el error cuando el quiz no existe', async () => {
    mockApi(
      { [`GET ${url}`]: () => apiError('NOT_FOUND', 'Quiz no encontrado', 404) },
      { session: ADMIN },
    );
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    expect(await screen.findByText('Quiz no encontrado')).toBeInTheDocument();
  });
});
