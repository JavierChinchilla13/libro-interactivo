import { screen, waitFor, within } from '@testing-library/react';
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
const stamp = '2026-10-01T10:00:00.000Z';
const url = `/api/admin/quizzes/${QUIZ_ID}`;

const answers = (q: number) =>
  ['a', 'b', 'c', 'd'].map((letter, index) => ({
    id: `p${q}${letter}`,
    text: `Respuesta ${letter} de la pregunta ${q}`,
    resultKey: index % 2 === 0 ? 'r1' : 'r2',
  }));

/** Quiz con `count` preguntas (títulos largos y con emoji de vez en cuando) en una sola etapa. */
const big = (count: number, over: object = {}) => ({
  id: QUIZ_ID,
  bookId: BOOK_ID,
  slug: 'quiz-grande',
  order: 1,
  title: 'Quiz grande',
  status: 'published',
  currentVersion: 2,
  allowRetake: true,
  showBreakdown: false,
  updatedAt: stamp,
  hasUnpublishedChanges: false,
  draft: {
    title: 'Quiz grande',
    instructionsHtml: '',
    settings: { allowRetake: true, showBreakdown: false },
    stages: [
      {
        id: 'etapa-1',
        order: 1,
        shuffleQuestions: true,
        shuffleAnswers: true,
        producesFinal: true,
        questions: Array.from({ length: count }, (_, index) => ({
          id: `p${index + 1}`,
          text:
            index % 9 === 0
              ? `🌙 ¿Qué harías si, en medio de la biblioteca sumergida, encontraras el archivo que Aleksandra Wiśniewska-Kowalczyk buscó toda su vida? (${index + 1})`
              : `¿Pregunta número ${index + 1}?`,
          answers: answers(index + 1),
        })),
      },
    ],
    results: [
      { key: 'r1', stageId: 'etapa-1', title: 'Uno' },
      { key: 'r2', stageId: 'etapa-1', title: 'Dos' },
    ],
  },
  ...over,
});

const open = (quiz: object) => mockApi({ [`GET ${url}`]: () => json(quiz) }, { session: ADMIN });

describe('editor de quizzes · cabecera y estado', { timeout: 30_000 }, () => {
  it('muestra una sola etiqueta de estado según el quiz', async () => {
    open(big(1, { status: 'draft', currentVersion: 0, hasUnpublishedChanges: true }));
    const view = renderAt(`/admin/quizzes/${QUIZ_ID}`);
    expect(await screen.findByText('Borrador')).toBeInTheDocument();
    view.unmount();

    open(big(1));
    const second = renderAt(`/admin/quizzes/${QUIZ_ID}`);
    expect(await screen.findByText('Publicado · v2')).toBeInTheDocument();
    second.unmount();

    open(big(1, { hasUnpublishedChanges: true }));
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    expect(await screen.findByText('Publicado · v2 con cambios sin publicar')).toBeInTheDocument();
  });

  it('cada pestaña lleva su frase de ayuda', async () => {
    open(big(1));
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz grande' });
    for (const [tab, help] of [
      ['Datos', 'Nombre, reglas y posición del quiz.'],
      ['Preguntas', 'Etapas, preguntas y a qué resultado suma cada respuesta.'],
      ['Resultados', 'Qué descubre la lectora al terminar.'],
      ['Versiones', 'Historial de lo publicado y cuántas lectoras lo usaron.'],
    ] as const) {
      await userEvent.click(screen.getByRole('tab', { name: tab }));
      expect(screen.getByText(help)).toBeInTheDocument();
    }
  });

  it('Publicar es la acción principal; Guardar borrador, Revisar y Vista previa son secundarias', async () => {
    open(big(1));
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz grande' });
    expect(screen.getByRole('button', { name: 'Publicar' })).toHaveClass('btn-primary');
    for (const name of ['Guardar borrador', 'Revisar', 'Vista previa']) {
      expect(screen.getByRole('button', { name })).toHaveClass('btn-secondary');
    }
    expect(screen.getByRole('button', { name: 'Revisar' })).toHaveAttribute(
      'title',
      'Comprueba que no falte nada antes de publicar',
    );
  });

  it('«Dirección web» y «Posición» están en un bloque plegado «Avanzado»', async () => {
    open(big(1));
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    const summary = await screen.findByText('Avanzado: dirección web y posición');
    const details = summary.closest('details');
    expect(details).not.toHaveAttribute('open');
    await userEvent.click(summary);
    expect(details).toHaveAttribute('open');
    expect(within(details as HTMLElement).getByLabelText(/Dirección web/)).toBeInTheDocument();
  });
});

describe('editor de quizzes · preguntas plegables (60 preguntas)', { timeout: 60_000 }, () => {
  it('con 60 preguntas las muestra plegadas, con su resumen, y se abre una a la vez', async () => {
    open(big(60));
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz grande' });
    await userEvent.click(screen.getByRole('tab', { name: 'Preguntas' }));
    expect(screen.getByText('60 preguntas · 240 respuestas')).toBeInTheDocument();
    // Ninguna abierta: solo hay 60 cabeceras y ningún campo de texto de pregunta.
    expect(screen.queryAllByRole('textbox', { name: 'Texto de la pregunta' })).toHaveLength(0);
    const folds = screen.getAllByRole('button', { name: /^Pregunta \d+$/ });
    expect(folds).toHaveLength(60);
    expect(folds[0]).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(folds[4] as HTMLElement);
    expect(folds[4]).toHaveAttribute('aria-expanded', 'true');
    const field = screen.getByRole('textbox', { name: 'Texto de la pregunta' });
    expect(field).toHaveValue('¿Pregunta número 5?');
    expect(screen.getAllByRole('textbox', { name: 'Texto de la pregunta' })).toHaveLength(1);

    await userEvent.click(folds[4] as HTMLElement);
    expect(screen.queryAllByRole('textbox', { name: 'Texto de la pregunta' })).toHaveLength(0);
  });

  it('el texto largo y con emoji se recorta en el resumen y la pregunta se puede abrir entera', async () => {
    open(big(60));
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz grande' });
    await userEvent.click(screen.getByRole('tab', { name: 'Preguntas' }));
    const first = screen.getAllByRole('button', { name: /^Pregunta \d+$/ })[0] as HTMLElement;
    expect(first.textContent).toContain('🌙');
    expect(first.querySelector('.admin-fold-summary')).not.toBeNull();
    await userEvent.click(first);
    expect(
      (screen.getByRole('textbox', { name: 'Texto de la pregunta' }) as HTMLTextAreaElement).value,
    ).toContain('Aleksandra Wiśniewska-Kowalczyk');
  });

  it('«Abrir todas» y «Plegar todas» abren y pliegan todas (12; con 60 se midió en el navegador)', async () => {
    open(big(12));
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz grande' });
    await userEvent.click(screen.getByRole('tab', { name: 'Preguntas' }));
    // Con 60 abiertas el árbol de accesibilidad es enorme: se cuenta en el DOM, no por rol.
    const fields = () => document.querySelectorAll('textarea').length;
    await userEvent.click(screen.getByRole('button', { name: 'Abrir todas' }));
    expect(fields()).toBeGreaterThanOrEqual(12);
    expect(
      Array.from(document.querySelectorAll('button.admin-fold')).every(
        (button) => button.getAttribute('aria-expanded') === 'true',
      ),
    ).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Plegar todas' }));
    expect(
      document.querySelectorAll('textarea[aria-label], .admin-fold[aria-expanded="true"]'),
    ).toHaveLength(0);
  });

  it('«Agregar pregunta» abre la nueva y suma una al contador', async () => {
    open(big(60));
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz grande' });
    await userEvent.click(screen.getByRole('tab', { name: 'Preguntas' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Agregar pregunta' }));
    expect(screen.getByText(/^61 preguntas · /)).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: 'Texto de la pregunta' })).toHaveLength(1);
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
  });

  it('con pocas preguntas (3 o menos) se ven abiertas desde el principio', async () => {
    open(big(2));
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz grande' });
    await userEvent.click(screen.getByRole('tab', { name: 'Preguntas' }));
    expect(screen.getAllByRole('textbox', { name: 'Texto de la pregunta' })).toHaveLength(2);
    expect(screen.getByText('2 preguntas · 8 respuestas')).toBeInTheDocument();
  });
});

describe('editor de quizzes · confirmaciones', { timeout: 30_000 }, () => {
  it('quitar una etapa pide confirmar, dice que es un cambio del borrador y solo entonces la quita', async () => {
    open(big(2));
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz grande' });
    await userEvent.click(screen.getByRole('tab', { name: 'Preguntas' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar etapa' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Quitar esta etapa?' });
    expect(dialog).toHaveTextContent('Es un cambio del borrador');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('Tienes cambios sin guardar')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar etapa' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Quitar etapa' }),
    );
    expect(await screen.findByText('Tienes cambios sin guardar')).toBeInTheDocument();
    expect(screen.getByText('Empieza agregando la primera etapa')).toBeInTheDocument();
  });

  it('archivar dice lo que se conserva y no llama al API si se cancela', async () => {
    const { called } = mockApi(
      {
        [`GET ${url}`]: () => json(big(1)),
        [`GET ${url}/versions`]: () => json({ versions: [] }),
        [`POST ${url}/archive`]: () => json(big(1, { status: 'archived' })),
      },
      { session: ADMIN },
    );
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz grande' });
    await userEvent.click(screen.getByRole('tab', { name: 'Versiones' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Archivar quiz' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Archivar este quiz?' });
    expect(dialog).toHaveTextContent(
      'Se conservan sus intentos, resultados y versiones publicadas',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(called(`POST ${url}/archive`)).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Archivar quiz' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archivar' }),
    );
    await waitFor(() => expect(called(`POST ${url}/archive`)).toHaveLength(1));
  });

  it('salir de una pantalla con cambios sin guardar pregunta antes; «Seguir editando» se queda', async () => {
    open(big(1));
    renderAt(`/admin/quizzes/${QUIZ_ID}`);
    await screen.findByRole('heading', { name: 'Quiz grande' });
    await userEvent.type(screen.getByRole('textbox', { name: /^Título/ }), ' nuevo');
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Administración' })).getByRole('link', {
        name: 'Libros',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Hay cambios sin guardar' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('heading', { name: /Quiz grande/ })).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Administración' })).getByRole('link', {
        name: 'Libros',
      }),
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Salir sin guardar' }),
    );
    expect(await screen.findByRole('heading', { name: 'Libros' })).toBeInTheDocument();
  });
});
