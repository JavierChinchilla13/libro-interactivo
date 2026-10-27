import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { empty, json, mockApi, renderAt } from '../../../test/mockApi';

const ADMIN = {
  id: '670000000000000000000001',
  name: 'Admin',
  email: 'a@ejemplo.com',
  role: 'ADMIN',
};
const BOOK_ID = '670000000000000000000010';
const QUIZ_ID = '670000000000000000000020';
const TOKEN_ID = '670000000000000000000030';
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
const token = (over: object = {}) => ({
  id: TOKEN_ID,
  bookId: BOOK_ID,
  target: { kind: 'quiz', refId: QUIZ_ID },
  label: 'Quiz 1 · Quiz Uno',
  status: 'active',
  redeemCount: 3,
  createdAt: stamp,
  ...over,
});
const accessKey = `GET /api/admin/access-tokens?bookId=${BOOK_ID}`;
const quizList = {
  quizzes: [
    {
      id: QUIZ_ID,
      bookId: BOOK_ID,
      slug: 'quiz-1',
      order: 1,
      title: 'Quiz Uno',
      status: 'published',
      currentVersion: 1,
      allowRetake: true,
      showBreakdown: false,
      updatedAt: stamp,
      hasUnpublishedChanges: false,
    },
  ],
};
const base = {
  'GET /api/admin/books': () => json({ books: [book] }),
  [accessKey]: () => json({ tokens: [token()] }),
  [`GET /api/admin/quizzes?bookId=${BOOK_ID}`]: () => json(quizList),
};

describe('códigos QR · confirmaciones y avisos', { timeout: 30_000 }, () => {
  it('revocar explica que quienes ya lo usaron conservan el acceso y avisa «Código revocado»', async () => {
    const { called } = mockApi(
      {
        ...base,
        [`POST /api/admin/access-tokens/${TOKEN_ID}/revoke`]: () =>
          json(token({ status: 'revoked' })),
      },
      { session: ADMIN },
    );
    renderAt('/admin/qr');
    await userEvent.click(await screen.findByRole('button', { name: 'Revocar' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Revocar este código?' });
    expect(dialog).toHaveTextContent('Quienes ya lo usaron conservan el acceso');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(called(`POST /api/admin/access-tokens/${TOKEN_ID}/revoke`)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Revocar' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revocar' }),
    );
    expect(await screen.findByText('Código revocado')).toBeInTheDocument();
  });

  it('crear un código nuevo (rotar) pide confirmar y dice que hay que volver a imprimir', async () => {
    const { called } = mockApi(
      {
        ...base,
        [`POST /api/admin/access-tokens/${TOKEN_ID}/rotate`]: () =>
          json(token({ id: '670000000000000000000031' })),
      },
      { session: ADMIN },
    );
    renderAt('/admin/qr');
    await userEvent.click(await screen.findByRole('button', { name: 'Rotar' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Crear un código nuevo?' });
    expect(dialog).toHaveTextContent('volver a imprimir el QR');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Crear código nuevo' }));
    await waitFor(() =>
      expect(called(`POST /api/admin/access-tokens/${TOKEN_ID}/rotate`)).toHaveLength(1),
    );
  });

  it('muestra la ayuda «¿Qué es esto?» cerrada y el estado con texto', async () => {
    mockApi(base, { session: ADMIN });
    renderAt('/admin/qr');
    expect(await screen.findByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('¿Qué es esto?').closest('details')).not.toHaveAttribute('open');
  });

  it('«Crear código» apagado explica por qué: «Elige un quiz primero» o que ya están todos cubiertos', async () => {
    mockApi({ ...base, [accessKey]: () => json({ tokens: [] }) }, { session: ADMIN });
    const view = renderAt('/admin/qr');
    const button = await screen.findByRole('button', { name: 'Crear código' });
    expect(button).toBeDisabled();
    expect(await screen.findByText('Elige un quiz primero.')).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription('Elige un quiz primero.');
    view.unmount();

    mockApi(base, { session: ADMIN });
    renderAt('/admin/qr');
    expect(
      await screen.findByText(
        'Todos los quizzes publicados de este libro ya tienen un código activo.',
      ),
    ).toBeInTheDocument();
  });

  it('«Revocar» lleva borde rojo y sin relleno, igual que las demás acciones destructivas', async () => {
    mockApi(base, { session: ADMIN });
    renderAt('/admin/qr');
    const revoke = await screen.findByRole('button', { name: 'Revocar' });
    expect(revoke).toHaveClass('btn-outline-danger');
    expect(revoke.className).not.toContain('bg-danger');
  });

  it('sin libros invita a crear uno', async () => {
    mockApi({ 'GET /api/admin/books': () => json({ books: [] }) }, { session: ADMIN });
    renderAt('/admin/qr');
    expect(await screen.findByText('Primero crea un libro y un quiz')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear libro' })).toHaveAttribute(
      'href',
      '/admin/libros/nuevo',
    );
  });
});

describe('mensajes · avisos breves', { timeout: 30_000 }, () => {
  it('marcar atendido avisa «Marcado como atendido»', async () => {
    const id = '670000000000000000000040';
    const message = (handled: boolean) => ({
      id,
      name: 'Visitante',
      email: 'v@ejemplo.com',
      message: 'Hola',
      createdAt: stamp,
      handled,
    });
    mockApi(
      {
        'GET /api/admin/contact-messages?status=unhandled&page=1': () =>
          json({ messages: [message(false)], total: 1, unhandled: 1, page: 1, pageSize: 20 }),
        [`PATCH /api/admin/contact-messages/${id}`]: () => json(message(true)),
        [`DELETE /api/admin/contact-messages/${id}`]: () => empty(),
      },
      { session: ADMIN },
    );
    renderAt('/admin/mensajes');
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar atendido' }));
    expect(await screen.findByText('Marcado como atendido')).toBeInTheDocument();
  });
});

describe('estadísticas · ayuda en contexto', { timeout: 30_000 }, () => {
  it('dice que solo cuentan intentos reales', async () => {
    mockApi(
      {
        'GET /api/admin/stats': () =>
          json({
            readers: { total: 1, last7Days: 1, last30Days: 1, disabled: 0 },
            staff: 1,
            attempts: { completed: 0, inProgress: 0 },
            booksCompleted: 0,
            unhandledMessages: 0,
            quizzes: [],
          }),
      },
      { session: ADMIN },
    );
    renderAt('/admin/estadisticas');
    expect(await screen.findByText('Todavía no hay quizzes publicados')).toBeInTheDocument();
    await userEvent.click(screen.getByText('¿Qué es esto?'));
    expect(
      screen.getByText('Solo cuentan intentos reales, no las pruebas del equipo.'),
    ).toBeVisible();
  });
});
