import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider, useConfirm } from './components/ConfirmDialog';
import { json, mockApi, renderAt } from '../../test/mockApi';

const ADMIN = {
  id: '670000000000000000000001',
  name: 'Marisol Quesada',
  email: 'm@ejemplo.com',
  role: 'ADMIN',
};
const QUIZ_ID = '670000000000000000000020';
const BOOK_ID = '670000000000000000000010';
const stamp = '2026-10-01T10:00:00.000Z';
const url = `/api/admin/quizzes/${QUIZ_ID}`;

const quiz = (title = 'Quiz uno') => ({
  id: QUIZ_ID,
  bookId: BOOK_ID,
  slug: 'quiz-uno',
  order: 1,
  title,
  status: 'draft',
  currentVersion: 0,
  allowRetake: true,
  showBreakdown: false,
  updatedAt: stamp,
  hasUnpublishedChanges: true,
  draft: {
    title,
    instructionsHtml: '',
    settings: { allowRetake: true, showBreakdown: false },
    stages: [],
    results: [],
  },
});

afterEach(() => vi.unstubAllGlobals());

describe('cierre · inicio honesto', { timeout: 30_000 }, () => {
  it('si falla una consulta del inicio no dice «Todo al día»: avisa y deja reintentar', async () => {
    mockApi(
      {
        'GET /api/admin/books': () => json({ books: [] }),
        'GET /api/admin/fan-arts?status=draft': () =>
          json({ error: { code: 'INTERNAL', message: 'x' } }, 500),
        'GET /api/admin/posts?status=draft': () => json({ posts: [] }),
        'GET /api/admin/site-settings': () =>
          json({
            welcome: { enabled: false, bodyHtml: '', showMode: 'every_login' },
            universe: { headline: '[PLACEHOLDER]', introHtml: '' },
            author: { bioHtml: '' },
            social: [],
            lock: { message: '[PLACEHOLDER]' },
          }),
        'GET /api/admin/stats': () =>
          json({
            readers: { total: 0, last7Days: 0, last30Days: 0, disabled: 0 },
            staff: 1,
            attempts: { completed: 0, inProgress: 0 },
            booksCompleted: 0,
            unhandledMessages: 0,
            quizzes: [],
          }),
        'GET /api/admin/access-tokens': () => json({ tokens: [] }),
        'GET /api/admin/contact-messages?status=unhandled': () =>
          json({ messages: [], total: 0, unhandled: 0, page: 1, pageSize: 20 }),
      },
      { session: ADMIN },
    );
    renderAt('/admin');
    expect(
      await screen.findByText('No pudimos revisar todo', {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Todo al día')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('cierre · confirmaciones', { timeout: 30_000 }, () => {
  function Probe() {
    const confirm = useConfirm();
    return (
      <button
        type="button"
        onClick={() => void confirm({ title: '¿Seguro?', confirmLabel: 'Sí', tone: 'danger' })}
      >
        Abrir
      </button>
    );
  }

  it('al cerrar devuelve el foco al botón que abrió el cuadro y, si borra algo, empieza en «Cancelar»', async () => {
    render(
      <ConfirmProvider>
        <Probe />
      </ConfirmProvider>,
    );
    const opener = screen.getByRole('button', { name: 'Abrir' });
    await userEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: '¿Seguro?' });
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe('cierre · editor de quizzes', { timeout: 30_000 }, () => {
  it('lo que se escribe mientras viaja el guardado no se pierde', async () => {
    let release: (response: Response) => void = () => undefined;
    mockApi(
      {
        [`GET ${url}`]: () => json(quiz()),
        [`PUT ${url}/draft`]: () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }) as unknown as Response,
      },
      { session: ADMIN },
    );
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    const title = await screen.findByRole('textbox', { name: /^Título/ });
    await userEvent.type(title, ' A');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    // Se sigue escribiendo mientras el servidor responde.
    await userEvent.type(title, 'B');
    release(json(quiz('Quiz uno A')));
    await screen.findByText('Borrador guardado');
    expect(title).toHaveValue('Quiz uno AB');
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
  });

  it('el error de una acción anterior no se queda pegado en la barra', async () => {
    let fail = true;
    mockApi(
      {
        [`GET ${url}`]: () => json(quiz()),
        [`POST ${url}/validate`]: () =>
          fail
            ? json({ error: { code: 'INTERNAL', message: 'Sin conexión' } }, 500)
            : json({ valid: true, errors: [], warnings: [] }),
        [`PUT ${url}/draft`]: ({ body }) => json({ ...quiz(), draft: body as object }),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Revisar' }));
    expect(await screen.findByRole('alert', {}, { timeout: 8000 })).toHaveTextContent(
      'Algo salió mal en el servidor',
    );
    fail = false;
    await userEvent.type(screen.getByRole('textbox', { name: /^Título/ }), ' 2');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await screen.findByText('Borrador guardado');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('en celular, con cambios, «Guardar» se ve a mano junto a «Publicar»', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    mockApi({ [`GET ${url}`]: () => json(quiz()) }, { session: ADMIN });
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz uno' });
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
    await userEvent.type(screen.getByRole('textbox', { name: /^Título/ }), ' 2');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument();
  });
});
