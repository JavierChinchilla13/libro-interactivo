import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOK_ID, apiError, json, mockApi, renderAt } from '../../test/mockApi';
import { RevealSequence } from './RevealSequence';
import { ResultView } from './ResultView';

const QUIZ = '670000000000000000000020';
const ATTEMPT = '670000000000000000000099';

const intro =
  (over: Record<string, unknown> = {}) =>
  () =>
    json({
      id: QUIZ,
      bookId: BOOK_ID,
      title: '[PLACEHOLDER] Quiz 2',
      instructionsHtml: '<p>[PLACEHOLDER] Instrucciones</p>',
      allowRetake: true,
      status: 'available',
      completedCount: 0,
      canStart: true,
      ...over,
    });

const q = (id: string, text: string) => ({
  id,
  text,
  answers: [
    { id: `${id}a`, text: `${text} - A` },
    { id: `${id}b`, text: `${text} - B` },
  ],
});
const stage = (questions: ReturnType<typeof q>[], title?: string) => ({
  stageId: 'etapa-1',
  ...(title ? { title } : {}),
  questions,
});
const inProgress = (st: ReturnType<typeof stage>) => () =>
  json({ attemptId: ATTEMPT, status: 'in_progress', stage: st });
const completed = (result: Record<string, unknown>) => () =>
  json({ attemptId: ATTEMPT, status: 'completed', result });

const progress = () =>
  json({
    bookId: BOOK_ID,
    bookCompleted: false,
    experiences: [
      {
        kind: 'quiz',
        id: '1'.repeat(24),
        title: 'Q1',
        order: 1,
        status: 'completed',
        inProgress: false,
        allowRetake: false,
      },
      {
        kind: 'quiz',
        id: QUIZ,
        title: 'Q2',
        order: 2,
        status: 'available',
        inProgress: false,
        allowRetake: true,
      },
    ],
  });

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('quiz: introducción', () => {
  it('muestra título, instrucciones, la posición en la secuencia y NO pide preguntas hasta pulsar «Comenzar»', async () => {
    const { called } = mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro(),
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress,
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    expect(
      await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' }),
    ).toBeInTheDocument();
    expect(screen.getByText('[PLACEHOLDER] Instrucciones')).toBeInTheDocument();
    expect(await screen.findByText('Quiz 2 de 2')).toBeInTheDocument();
    expect(screen.queryByText(/se juega una sola vez/)).not.toBeInTheDocument();
    expect(called(`POST /api/quizzes/${QUIZ}/attempts`)).toHaveLength(0);
  });

  it('un quiz de una sola vez lo avisa ANTES de empezar; ya completado no ofrece empezar', async () => {
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro({
        allowRetake: false,
        status: 'completed',
        completedCount: 1,
        canStart: false,
      }),
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    expect(await screen.findByText('Este quiz se juega una sola vez')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver mi resultado' })).toHaveAttribute(
      'href',
      `/panel/resultados/${QUIZ}`,
    );
    expect(
      screen.queryByRole('button', { name: /Comenzar|Repetir|Continuar/ }),
    ).not.toBeInTheDocument();
  });

  it('con un intento a medias ofrece «Continuar» y un quiz repetible ya completado, «Repetir»', async () => {
    mockApi({ [`GET /api/quizzes/${QUIZ}`]: intro({ inProgressAttemptId: ATTEMPT }) });
    renderAt(`/panel/quiz/${QUIZ}`);
    expect(await screen.findByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    vi.unstubAllGlobals();
    mockApi({ [`GET /api/quizzes/${QUIZ}`]: intro({ status: 'completed', completedCount: 2 }) });
    renderAt(`/panel/quiz/${QUIZ}`);
    expect(await screen.findByRole('button', { name: 'Repetir' })).toBeInTheDocument();
  });

  it('un quiz sin desbloquear (403) muestra el aviso sin contenido y vuelve al panel', async () => {
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: () =>
        apiError('NOT_UNLOCKED', 'Aún no puedes acceder a este contenido', 403),
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    expect(
      await screen.findByRole('heading', { name: 'Aún no puedes hacer este quiz' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mi panel' })).toHaveAttribute(
      'href',
      '/panel',
    );
    expect(screen.queryByRole('button', { name: 'Comenzar' })).not.toBeInTheDocument();
  });

  it('si el servidor rechaza empezar de nuevo un quiz de una sola vez, lo dice (409)', async () => {
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro(),
      [`POST /api/quizzes/${QUIZ}/attempts`]: () =>
        apiError('CONFLICT', 'Este quiz solo se puede jugar una vez', 409),
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este quiz solo se puede jugar una vez.',
    );
  });
});

describe('quiz: preguntas', () => {
  const twoQuestions = stage([q('p1', 'Pregunta uno'), q('p2', 'Pregunta dos')]);

  it('una pregunta a la vez, «Siguiente» bloqueado hasta elegir, «Atrás» conserva lo elegido y se envían TODAS las respuestas al terminar', async () => {
    const { called } = mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro(),
      [`POST /api/quizzes/${QUIZ}/attempts`]: inProgress(twoQuestions),
      [`POST /api/attempts/${ATTEMPT}/stages/etapa-1/answers`]: completed({
        key: 'r1',
        title: '[PLACEHOLDER] Resultado A',
      }),
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));

    expect(await screen.findByText('Pregunta 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avance del quiz' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
    const next = screen.getByRole('button', { name: /Siguiente/ });
    expect(next).toBeDisabled();
    expect(screen.getByRole('button', { name: /Atrás/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('radio', { name: 'Pregunta uno - B' }));
    expect(next).toBeEnabled();
    await userEvent.click(next);

    expect(screen.getByText('Pregunta 2 de 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Siguiente/ })).not.toBeInTheDocument();
    const finish = screen.getByRole('button', { name: 'Terminar' });
    expect(finish).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: /Atrás/ }));
    expect(screen.getByRole('radio', { name: 'Pregunta uno - B' })).toBeChecked(); // lo elegido se conserva
    await userEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'Pregunta dos - A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Terminar' }));

    await screen.findByRole('heading', { name: '[PLACEHOLDER] Resultado A' });
    const sent = called(`POST /api/attempts/${ATTEMPT}/stages/etapa-1/answers`);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toEqual({
      answers: [
        { questionId: 'p1', answerId: 'p1b' },
        { questionId: 'p2', answerId: 'p2a' },
      ],
    });
  });

  it('una segunda etapa (quiz de dos etapas) empieza de nuevo con su título y sus preguntas', async () => {
    const second = {
      ...stage([q('p9', 'Pregunta final')], 'Tu campo es Naturales'),
      stageId: 'etapa-naturales',
    };
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro(),
      [`POST /api/quizzes/${QUIZ}/attempts`]: inProgress(stage([q('p1', 'Pregunta uno')])),
      [`POST /api/attempts/${ATTEMPT}/stages/etapa-1/answers`]: inProgress(second),
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await userEvent.click(await screen.findByRole('radio', { name: 'Pregunta uno - A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Terminar' }));
    expect(await screen.findByText('Tu campo es Naturales')).toBeInTheDocument();
    expect(screen.getByText('Pregunta 1 de 1')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pregunta final - A' })).not.toBeChecked();
  });

  it('un fallo al enviar se muestra y no pierde las respuestas', async () => {
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro(),
      [`POST /api/quizzes/${QUIZ}/attempts`]: inProgress(stage([q('p1', 'Pregunta uno')])),
      [`POST /api/attempts/${ATTEMPT}/stages/etapa-1/answers`]: () =>
        apiError('INTERNAL', 'x', 500),
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await userEvent.click(await screen.findByRole('radio', { name: 'Pregunta uno - A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Terminar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal');
    expect(screen.getByRole('radio', { name: 'Pregunta uno - A' })).toBeChecked();
  });

  it('nunca aparece nada que revele a qué resultado apunta una respuesta', async () => {
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro(),
      [`POST /api/quizzes/${QUIZ}/attempts`]: inProgress(stage([q('p1', 'Pregunta uno')])),
    });
    const { container } = renderAt(`/panel/quiz/${QUIZ}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await screen.findByText('Pregunta 1 de 1');
    expect(container.innerHTML).not.toMatch(/resultKey|r1|reveal/i);
  });
});

describe('quiz: revelado y resultado', () => {
  it('con secuencia: se muestra el revelado, «Saltar» lleva al resultado y se refresca el avance', async () => {
    const { called } = mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro(),
      [`POST /api/quizzes/${QUIZ}/attempts`]: inProgress(stage([q('p1', 'Pregunta uno')])),
      [`POST /api/attempts/${ATTEMPT}/stages/etapa-1/answers`]: completed({
        key: 'r1',
        title: '[PLACEHOLDER] Resultado A',
        revealIntro: { lines: ['[PLACEHOLDER] Decodificando…'], effect: 'decodificar' },
        reveal: { lines: ['[PLACEHOLDER] Tu poder despierta'] },
        facts: [{ label: 'Tu cápsula', value: '[PLACEHOLDER] 7' }],
      }),
      [`GET /api/me/progress?bookId=${BOOK_ID}`]: progress,
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await userEvent.click(await screen.findByRole('radio', { name: 'Pregunta uno - A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Terminar' }));

    expect(await screen.findByText('[PLACEHOLDER] Decodificando…')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '[PLACEHOLDER] Resultado A' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Saltar ›' }));

    expect(
      await screen.findByRole('heading', { name: '[PLACEHOLDER] Resultado A' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Tu cápsula')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mi panel' })).toHaveAttribute(
      'href',
      '/panel',
    );
    expect(screen.getByRole('button', { name: '¿Quieres jugar otra vez?' })).toBeInTheDocument();
    await waitFor(() => expect(called(`GET /api/quizzes/${QUIZ}`).length).toBeGreaterThan(1)); // intro refrescada
  });

  it('sin secuencia va directo al resultado; en un quiz de una sola vez no ofrece jugar otra vez', async () => {
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro({ allowRetake: false }),
      [`POST /api/quizzes/${QUIZ}/attempts`]: inProgress(stage([q('p1', 'Pregunta uno')])),
      [`POST /api/attempts/${ATTEMPT}/stages/etapa-1/answers`]: completed({
        key: 'r1',
        title: '[PLACEHOLDER] Resultado A',
      }),
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await userEvent.click(await screen.findByRole('radio', { name: 'Pregunta uno - A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Terminar' }));
    expect(
      await screen.findByRole('heading', { name: '[PLACEHOLDER] Resultado A' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '¿Quieres jugar otra vez?' }),
    ).not.toBeInTheDocument();
  });
});

describe('secuencia de revelado', () => {
  it('muestra las líneas de una en una y termina sola tras la última', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<RevealSequence lines={['Uno', 'Dos', 'Tres']} effect="brillo" onDone={onDone} />);
    expect(screen.getByText('Uno')).toBeInTheDocument();
    expect(screen.queryByText('Dos')).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1500));
    expect(screen.getByText('Dos')).toBeInTheDocument();
    expect(screen.queryByText('Tres')).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1500));
    expect(screen.getByText('Tres')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1200));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Tus resultados se están preparando')).toHaveAttribute(
      'data-effect',
      'brillo',
    );
  });

  it('«Saltar» termina de inmediato', async () => {
    const onDone = vi.fn();
    render(<RevealSequence lines={['Uno', 'Dos']} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: 'Saltar ›' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('con «reducir movimiento» muestra todo junto, no avanza sola y pide continuar', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    const onDone = vi.fn();
    render(<RevealSequence lines={['Uno', 'Dos', 'Tres']} onDone={onDone} />);
    expect(screen.getByText('Uno')).toBeInTheDocument();
    expect(screen.getByText('Tres')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(20_000));
    expect(onDone).not.toHaveBeenCalled();
    screen.getByRole('button', { name: 'Ver mi resultado' }).click();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('vista del resultado', () => {
  it('muestra el perfil con porcentajes de mayor a menor', () => {
    render(
      <ResultView
        result={{
          key: 'r1',
          title: 'Perfil',
          distribution: [
            { key: 'r2', title: 'Segundo', percent: 30 },
            { key: 'r1', title: 'Primero', percent: 70 },
          ],
        }}
      />,
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Primero70%', 'Segundo30%']);
  });

  it('el video corto va mudo, en bucle y con controles; la imagen lleva su texto alternativo', () => {
    const { container, rerender } = render(
      <ResultView
        result={{
          key: 'r1',
          title: 'Poder',
          media: {
            kind: 'video',
            video: {
              provider: 'cloudinary',
              publicId: 'v',
              url: 'https://res.cloudinary.com/x/video/upload/v.mp4',
              width: 1,
              height: 1,
              durationSeconds: 4,
              alt: 'Descripción del video',
            },
          },
        }}
      />,
    );
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('aria-label', 'Descripción del video');
    expect(video?.muted).toBe(true);
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('controls');
    rerender(
      <ResultView
        result={{
          key: 'r1',
          title: 'Poder',
          media: {
            kind: 'image',
            image: {
              provider: 'cloudinary',
              publicId: 'i',
              deliveryType: 'upload',
              url: 'https://res.cloudinary.com/x/image/upload/i.png',
              width: 1,
              height: 1,
              alt: 'Una imagen',
            },
          },
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Una imagen' })).toHaveAttribute(
      'src',
      expect.stringContaining('f_auto,q_auto'),
    );
  });

  it('la descripción se muestra saneada', () => {
    const { container } = render(
      <ResultView
        result={{
          key: 'r1',
          title: 'T',
          description: '<p>Hola</p><script>alert(1)</script><img src=x onerror=alert(1)>',
        }}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toMatch(/onerror/);
    expect(screen.getByText('Hola')).toBeInTheDocument();
  });
});
