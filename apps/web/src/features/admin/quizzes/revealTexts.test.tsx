import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockApi, renderAt } from '../../../test/mockApi';

const ADMIN = {
  id: '670000000000000000000001',
  name: 'Admin',
  email: 'a@ejemplo.com',
  role: 'ADMIN',
};
const QUIZ_ID = '670000000000000000000020';
const BOOK_ID = '670000000000000000000010';

/** Un quiz guardado antes del cambio, con un `effect` antiguo en las líneas generales y en un resultado. */
const quiz = {
  id: QUIZ_ID,
  bookId: BOOK_ID,
  slug: 'quiz-1',
  order: 1,
  title: 'Quiz uno',
  status: 'draft',
  currentVersion: 0,
  allowRetake: true,
  showBreakdown: false,
  updatedAt: '2026-10-01T10:00:00.000Z',
  hasUnpublishedChanges: true,
  draft: {
    title: 'Quiz uno',
    instructionsHtml: '',
    settings: {
      allowRetake: true,
      showBreakdown: false,
      revealIntro: { lines: ['Calculando…'], effect: 'chispas' },
    },
    stages: [
      {
        id: 'etapa-1',
        order: 1,
        shuffleQuestions: true,
        shuffleAnswers: true,
        producesFinal: true,
        questions: [
          {
            id: 'p1',
            text: '¿Pregunta?',
            answers: [
              { id: 'p1a', text: 'A', resultKey: 'r1' },
              { id: 'p1b', text: 'B', resultKey: 'r2' },
            ],
          },
        ],
      },
    ],
    results: [
      {
        key: 'r1',
        stageId: 'etapa-1',
        title: 'Uno',
        reveal: { lines: ['Tu campo…'], effect: 'humo' },
      },
      { key: 'r2', stageId: 'etapa-1', title: 'Dos' },
    ],
  },
};

describe('líneas antes del resultado (pestañas Datos y Resultados)', () => {
  it('Datos explica que las ve todo el mundo antes de las propias de cada resultado, sin «Animación de la espera»', async () => {
    mockApi({ [`GET /api/admin/quizzes/${QUIZ_ID}`]: () => json(quiz) }, { session: ADMIN });
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz uno' });
    expect(
      screen.getByText(
        /Las ven todos los lectores, antes de las líneas propias de cada resultado \(pestaña Resultados\)\. Si quieres líneas distintas para cada resultado, deja esta lista vacía y escríbelas en Resultados\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/iguales para todos los resultados/)).toBeNull();
    expect(screen.queryByLabelText(/Animación de la espera/)).toBeNull();

    await userEvent.click(screen.getByRole('tab', { name: 'Resultados' }));
    expect(await screen.findAllByText('Líneas propias antes de este resultado')).not.toHaveLength(
      0,
    );
    expect(screen.queryByLabelText(/Animación de la espera/)).toBeNull();
  });
});
