import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOK, READER, json, mockApi, renderAt } from '../../test/mockApi';

afterEach(() => vi.unstubAllGlobals());

const ADMIN = { ...READER, id: '670000000000000000000002', name: 'Marisol', role: 'ADMIN' };
const QUIZ = '670000000000000000000020';
const ATTEMPT = '670000000000000000000099';
const DRAFT_ID = '670000000000000000000040';

const intro = {
  id: QUIZ,
  bookId: DRAFT_ID,
  title: '[PLACEHOLDER] Quiz en borrador',
  instructionsHtml: '<p>[PLACEHOLDER] Introducción</p>',
  allowRetake: false,
  status: 'available',
  completedCount: 0,
  canStart: true,
};
const stage = {
  stageId: 'etapa-1',
  questions: [
    {
      id: 'q1',
      text: '[PLACEHOLDER] Pregunta',
      answers: [
        { id: 'q1a', text: 'Respuesta A' },
        { id: 'q1b', text: 'Respuesta B' },
      ],
    },
  ],
};
const library = {
  'GET /api/me/library': () =>
    json({
      books: [
        {
          book: { ...BOOK, id: DRAFT_ID, slug: 'libro-borrador', order: 3, status: 'upcoming' },
          access: 'open',
          unpublished: 'draft',
          progress: { done: 0, total: 0, bookCompleted: false },
        },
      ],
    }),
  [`GET /api/me/progress?bookId=${DRAFT_ID}`]: () =>
    json({ bookId: DRAFT_ID, bookCompleted: false, experiences: [] }),
};

describe('quiz en modo borrador (?fuente=borrador)', () => {
  it('usa las rutas de prueba del borrador, no las publicadas, y la franja dice que se prueba el BORRADOR', async () => {
    const { called } = mockApi(
      {
        ...library,
        [`GET /api/admin/quizzes/${QUIZ}/test-intro`]: () => json(intro),
        [`POST /api/admin/quizzes/${QUIZ}/test-attempts`]: () =>
          json({ attemptId: ATTEMPT, status: 'in_progress', stage }),
        [`POST /api/attempts/${ATTEMPT}/stages/etapa-1/answers`]: () =>
          json({
            attemptId: ATTEMPT,
            status: 'completed',
            result: { key: 'r1', title: '[PLACEHOLDER] Resultado del borrador' },
          }),
      },
      { session: ADMIN },
    );
    renderAt(`/panel/quiz/${QUIZ}?fuente=borrador`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz en borrador' });
    // La franja se carga aparte (solo el equipo): se espera.
    const banner = await screen.findByTestId('test-mode-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(banner).toHaveTextContent('Probando el BORRADOR (no publicado).');
    await waitFor(() =>
      expect(screen.getByTestId('test-mode-banner')).toHaveTextContent(
        'Este libro aún no está publicado: los lectores no lo ven.',
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Comenzar' }));
    await userEvent.click(await screen.findByRole('radio', { name: /Respuesta A/ }));
    await userEvent.click(
      screen.getByRole('button', { name: /Enviar|Ver mi resultado|Terminar|Continuar/ }),
    );
    expect(
      await screen.findByRole('heading', { name: '[PLACEHOLDER] Resultado del borrador' }),
    ).toBeInTheDocument();

    // Nunca se pidió lo publicado.
    expect(called(`GET /api/quizzes/${QUIZ}`)).toHaveLength(0);
    expect(called(`POST /api/quizzes/${QUIZ}/attempts`)).toHaveLength(0);
    expect(called(`POST /api/admin/quizzes/${QUIZ}/test-attempts`)).toHaveLength(1);
  });

  it('al terminar no ofrece «Mis resultados» ni un siguiente paso: vuelve al editor y se puede repetir', async () => {
    mockApi(
      {
        ...library,
        [`GET /api/admin/quizzes/${QUIZ}/test-intro`]: () => json(intro),
        [`POST /api/admin/quizzes/${QUIZ}/test-attempts`]: () =>
          json({ attemptId: ATTEMPT, status: 'in_progress', stage }),
        [`POST /api/attempts/${ATTEMPT}/stages/etapa-1/answers`]: () =>
          json({
            attemptId: ATTEMPT,
            status: 'completed',
            result: { key: 'r1', title: '[PLACEHOLDER] Resultado del borrador' },
          }),
      },
      { session: ADMIN },
    );
    renderAt(`/panel/quiz/${QUIZ}?fuente=borrador`);
    await userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await userEvent.click(await screen.findByRole('radio', { name: /Respuesta A/ }));
    await userEvent.click(
      screen.getByRole('button', { name: /Enviar|Ver mi resultado|Terminar|Continuar/ }),
    );
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Resultado del borrador' });
    expect(screen.getByRole('link', { name: 'Volver al editor del quiz' })).toHaveAttribute(
      'href',
      `/admin/quizzes/${QUIZ}`,
    );
    expect(screen.queryByRole('link', { name: 'Mis resultados' })).toBeNull();
    // El quiz publicado es de una sola vez, pero una prueba del borrador siempre se puede repetir.
    expect(screen.getByRole('button', { name: '¿Quieres jugar otra vez?' })).toBeInTheDocument();
  });

  it('sin el parámetro todo es lo de siempre: rutas publicadas y la franja sin la frase del borrador', async () => {
    const { called } = mockApi(
      {
        ...library,
        [`GET /api/quizzes/${QUIZ}`]: () => json(intro),
        [`GET /api/me/progress?bookId=${DRAFT_ID}`]: () =>
          json({ bookId: DRAFT_ID, bookCompleted: false, experiences: [] }),
      },
      { session: ADMIN },
    );
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz en borrador' });
    expect(await screen.findByTestId('test-mode-banner')).not.toHaveTextContent(
      'Probando el BORRADOR',
    );
    expect(called(`GET /api/admin/quizzes/${QUIZ}/test-intro`)).toHaveLength(0);
  });

  it('un lector con el parámetro no recibe la prueba: el servidor responde 403 y la pantalla no abre nada', async () => {
    mockApi(
      {
        'GET /api/me/library': () => json({ books: [] }),
        [`GET /api/admin/quizzes/${QUIZ}/test-intro`]: () =>
          json({ error: { code: 'FORBIDDEN', message: 'No tienes permiso para esto' } }, 403),
      },
      { session: READER },
    );
    renderAt(`/panel/quiz/${QUIZ}?fuente=borrador`);
    expect(
      await screen.findByRole('heading', { name: 'No pudimos abrir el quiz' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('test-mode-banner')).toBeNull();
    expect(screen.queryByText(/Probando el BORRADOR/)).toBeNull();
  });
});
