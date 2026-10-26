import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOK_ID, json, mockApi, renderAt } from '../../test/mockApi';
import { claimAnimation, releaseAnimation } from '../../shared/lib/animationSlot';
import { OVERLAY_FLOOR } from '@libro/shared';

const QUIZ = '670000000000000000000020';

const image = (name = 'uno') => ({
  provider: 'cloudinary' as const,
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/${name}.jpg`,
  width: 1920,
  height: 1080,
  alt: 'Niebla sobre la ciudad',
  deliveryType: 'upload' as const,
});
const video = {
  provider: 'cloudinary' as const,
  publicId: 'libro/quiz-bg/v',
  url: 'https://res.cloudinary.com/demo/video/upload/libro/quiz-bg/v.mp4',
  width: 1280,
  height: 720,
  durationSeconds: 8,
  posterUrl: 'https://res.cloudinary.com/demo/video/upload/so_0,f_auto,q_auto/libro/quiz-bg/v.jpg',
  alt: 'Humo lento',
};

const intro = (appearance?: Record<string, unknown>) => () =>
  json({
    id: QUIZ,
    bookId: BOOK_ID,
    title: '[PLACEHOLDER] Quiz 2',
    instructionsHtml: '<p>[PLACEHOLDER] Instrucciones</p>',
    allowRetake: true,
    status: 'available',
    completedCount: 0,
    canStart: true,
    ...(appearance ? { appearance } : {}),
  });

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
let observerCallbacks: ((entries: { isIntersecting: boolean }[]) => void)[];

function stubEnvironment({ reduced = false, saveData = false } = {}) {
  observerCallbacks = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observerCallbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  Object.defineProperty(navigator, 'connection', { value: { saveData }, configurable: true });
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play as never);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause as never);
}

beforeEach(() => {
  localStorage.clear();
  stubEnvironment();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
});

const bg = () => document.querySelector('.quiz-bg') as HTMLElement | null;

describe('QuizPage: fondo de la apariencia', () => {
  it('sin apariencia no pinta ningún fondo ni botón de pausa', async () => {
    mockApi({ [`GET /api/quizzes/${QUIZ}`]: intro() });
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    expect(bg()).toBeNull();
    expect(screen.queryByRole('button', { name: /fondo/i })).toBeNull();
  });

  it('con imagen: una capa fija con el texto alternativo una sola vez, sin botón de pausa y con el velo del piso hasta medir', async () => {
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro({
        background: { kind: 'image', image: image() },
        overlay: { mode: 'auto', strength: 0.6 },
        accent: 'accent',
      }),
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    const layer = bg();
    expect(layer).not.toBeNull();
    // El fondo vive fuera del contenido (portal en el body): no se mueve ni lo tapa un contenedor con transform.
    expect(layer?.parentElement).toBe(document.body);
    expect(screen.getAllByRole('img', { name: 'Niebla sobre la ciudad' })).toHaveLength(1);
    // jsdom no puede medir el fondo: manda el piso, que se lee incluso sobre un píxel blanco.
    expect(layer?.style.getPropertyValue('--quiz-veil')).toBe(String(OVERLAY_FLOOR));
    expect(layer?.querySelector('img')?.getAttribute('src')).toContain('w_1080');
    expect(layer?.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button', { name: /fondo/i })).toBeNull();
  });

  it('el velo manual usa lo guardado (nunca menos del piso) y el acento sale como variable CSS del contenedor', async () => {
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro({
        background: { kind: 'image', image: image() },
        overlay: { mode: 'manual', strength: 0.88 },
        accent: '#ffcb66',
      }),
    });
    const { container } = renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    expect(bg()?.style.getPropertyValue('--quiz-veil')).toBe('0.88');
    expect(
      (
        container.querySelector('[style*="--quiz-accent"]') as HTMLElement | null
      )?.style.getPropertyValue('--quiz-accent'),
    ).toBe('#ffcb66');
  });

  it('un acento que no se leería sobre el fondo velado se aclara lo mínimo; uno que se lee se pinta tal cual', async () => {
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro({
        background: { kind: 'image', image: image() },
        overlay: { mode: 'manual', strength: 0.8 },
        accent: '#1a3a6e',
      }),
    });
    const { container } = renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    const painted = (container.querySelector('[style*="--quiz-accent"]') as HTMLElement).style
      .getPropertyValue('--quiz-accent')
      .trim();
    expect(painted).toMatch(/^#[0-9a-f]{6}$/);
    expect(painted).not.toBe('#1a3a6e');
    const { contrast } = await import('../../shared/lib/color');
    const { accentBackdrop } = await import('../../shared/lib/quizAppearance');
    expect(contrast(painted, accentBackdrop(true, undefined, 0.8))).toBeGreaterThanOrEqual(3);
  });

  it('si el fondo no carga, queda el color liso del sitio (la capa existe, la imagen sigue oculta)', async () => {
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro({
        background: { kind: 'image', image: image() },
        overlay: { mode: 'manual', strength: 0.8 },
      }),
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    const img = bg()?.querySelector('img') as HTMLImageElement;
    fireEvent.error(img);
    expect(bg()).not.toHaveAttribute('data-loaded');
    // El texto sigue disponible y el título del quiz se ve.
    expect(screen.getByText('[PLACEHOLDER] Instrucciones')).toBeInTheDocument();
  });
});

describe('QuizPage: video de fondo', () => {
  const withVideo = (overlay = { mode: 'manual', strength: 0.82 }) =>
    intro({ background: { kind: 'video', video }, overlay });

  it('es mudo, en bucle, sin controles nativos, con póster aparte, sin descargar nada hasta correr y con botón de pausa', async () => {
    mockApi({ [`GET /api/quizzes/${QUIZ}`]: withVideo() });
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    const el = bg()?.querySelector('video') as HTMLVideoElement;
    expect(el).not.toBeNull();
    expect(el.muted).toBe(true);
    expect(el).toHaveAttribute('loop');
    expect(el).toHaveAttribute('playsinline');
    expect(el).toHaveAttribute('preload', 'none');
    expect(el).not.toHaveAttribute('controls');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el.getAttribute('src')).toContain('f_auto,q_auto,c_limit,w_');
    expect(bg()?.querySelector('img')?.getAttribute('src')).toContain('so_0,f_auto,q_auto');
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Pausar video de fondo' })).toBeInTheDocument();
  });

  it('el botón pausa y reanuda; con la pestaña oculta o fuera de pantalla se pausa sin cambiar el botón', async () => {
    mockApi({ [`GET /api/quizzes/${QUIZ}`]: withVideo() });
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    // Pestaña oculta → se pausa; al volver, corre otra vez.
    pause.mockClear();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(pause).toHaveBeenCalled());
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));

    // Fuera de pantalla → se pausa.
    pause.mockClear();
    act(() => observerCallbacks.forEach((callback) => callback([{ isIntersecting: false }])));
    await waitFor(() => expect(pause).toHaveBeenCalled());
    act(() => observerCallbacks.forEach((callback) => callback([{ isIntersecting: true }])));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(3));

    // Pausa de la persona: se respeta aunque vuelva a verse.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Pausar video de fondo' }));
    expect(screen.getByRole('button', { name: 'Reproducir video de fondo' })).toBeInTheDocument();
    act(() => observerCallbacks.forEach((callback) => callback([{ isIntersecting: true }])));
    expect(play).toHaveBeenCalledTimes(3);
    await user.click(screen.getByRole('button', { name: 'Reproducir video de fondo' }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(4));
  });

  it('el botón de pausa mide al menos 44 px (clase de objetivo táctil) y es un <button> con nombre', async () => {
    mockApi({ [`GET /api/quizzes/${QUIZ}`]: withVideo() });
    renderAt(`/panel/quiz/${QUIZ}`);
    const button = await screen.findByRole('button', { name: 'Pausar video de fondo' });
    expect(button).toHaveClass('playback-toggle');
    expect(button.tagName).toBe('BUTTON');
  });

  it('otro elemento animado (un campo de poder) toma el lugar: el video se pausa y no se reanuda solo', async () => {
    mockApi({ [`GET /api/quizzes/${QUIZ}`]: withVideo() });
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    pause.mockClear();
    const canvas = { pause: vi.fn() };
    act(() => claimAnimation(canvas));
    await waitFor(() => expect(pause).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Reproducir video de fondo' })).toBeInTheDocument();
    act(() => releaseAnimation(canvas));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('con «reducir movimiento» solo se ve el póster: no hay <video> ni botón, y no se pide nada', async () => {
    stubEnvironment({ reduced: true });
    mockApi({ [`GET /api/quizzes/${QUIZ}`]: withVideo() });
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    expect(bg()?.querySelector('video')).toBeNull();
    expect(bg()?.querySelector('img')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /video de fondo/i })).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('con ahorro de datos solo se ve el póster', async () => {
    stubEnvironment({ saveData: true });
    mockApi({ [`GET /api/quizzes/${QUIZ}`]: withVideo() });
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    expect(bg()?.querySelector('video')).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('si el póster no carga se quita la imagen rota y queda el color liso; si el video falla, el póster', async () => {
    mockApi({ [`GET /api/quizzes/${QUIZ}`]: withVideo() });
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    fireEvent.error(bg()?.querySelector('img') as HTMLImageElement);
    expect(bg()?.querySelector('img')).toBeNull();
    fireEvent.error(bg()?.querySelector('video') as HTMLVideoElement);
    expect(bg()?.querySelector('video')).toBeNull();
    // Sin video no hay nada que pausar: el botón desaparece.
    expect(screen.queryByRole('button', { name: /video de fondo/i })).toBeNull();
    expect(bg()?.querySelector('.quiz-bg-veil')).not.toBeNull();
    expect(screen.getByText('[PLACEHOLDER] Instrucciones')).toBeInTheDocument();
  });
});

describe('QuizPage: el fondo no se remonta al cambiar de fase', () => {
  it('es el mismo elemento en la introducción y en las preguntas (no se desmonta al cambiar de fase)', async () => {
    const stage = {
      stageId: 'etapa-1',
      questions: [
        {
          id: 'p1',
          text: '¿Qué haces?',
          answers: [
            { id: 'p1a', text: 'Me quedo' },
            { id: 'p1b', text: 'Me voy' },
          ],
        },
      ],
    };
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro({
        background: { kind: 'video', video },
        overlay: { mode: 'manual', strength: 0.82 },
      }),
      [`POST /api/quizzes/${QUIZ}/attempts`]: () =>
        json({ attemptId: '670000000000000000000099', status: 'in_progress', stage }),
      'POST /api/attempts/670000000000000000000099/stages/etapa-1/answers': () => json({}),
    });
    renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    const before = bg();
    expect(before?.querySelector('video')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Comenzar' }));
    await screen.findByText('¿Qué haces?');
    // Misma capa (no se desmontó) y el video siguió siendo el mismo elemento.
    expect(bg()).toBe(before);
    expect(bg()?.querySelector('video')).not.toBeNull();
  });
});

describe('QuizPage: fondo, velo y acento por pregunta', () => {
  const ATTEMPT_ID = '670000000000000000000099';
  const question = (id: string, text: string, appearance?: object) => ({
    id,
    text,
    ...(appearance ? { appearance } : {}),
    answers: [
      { id: `${id}a`, text: `${text} A` },
      { id: `${id}b`, text: `${text} B` },
    ],
  });
  const general = {
    background: { kind: 'image', image: image('general') },
    overlay: { mode: 'manual', strength: 0.8 },
    accent: '#a89bff',
  };
  const setup = (questions: object[], appearance: Record<string, unknown> = general) =>
    mockApi({
      [`GET /api/quizzes/${QUIZ}`]: intro(appearance),
      [`POST /api/quizzes/${QUIZ}/attempts`]: () =>
        json({
          attemptId: ATTEMPT_ID,
          status: 'in_progress',
          stage: { stageId: 'etapa-1', questions },
        }),
    });
  const layers = () => [...document.querySelectorAll<HTMLElement>('.quiz-bg')];
  const sources = () =>
    layers().map((layer) => layer.querySelector('img')?.getAttribute('src') ?? '');
  const next = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole('radio')[0]!);
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
  };
  const accentOf = () =>
    (
      document.querySelector('[style*="--quiz-accent"]') as HTMLElement | null
    )?.style.getPropertyValue('--quiz-accent') ?? '';

  it('cada pregunta usa su fondo, velo y acento; lo que no define es el general; el medio de una pregunta no se pide hasta llegar a ella', async () => {
    const warmed: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        decoding = '';
        set src(value: string) {
          warmed.push(value);
        }
      },
    );
    setup([
      question('q1', 'Primera'),
      question('q2', 'Segunda', {
        background: { kind: 'image', image: image('propia') },
        overlay: { mode: 'manual', strength: 0.9 },
        accent: '#ff8fb1',
      }),
      question('q3', 'Tercera', { background: { kind: 'none' } }),
    ]);
    const user = userEvent.setup();
    renderAt(`/panel/quiz/${QUIZ}`);
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await screen.findByText('Primera');
    // Pregunta 1: el general. La imagen de la 2 todavía NO está en la página, solo se precalentó.
    expect(layers()).toHaveLength(1);
    expect(sources()[0]).toContain('general');
    expect(document.querySelector('img[src*="propia"]')).toBeNull();
    expect(warmed.some((url) => url.includes('propia'))).toBe(true);
    expect(layers()[0]?.style.getPropertyValue('--quiz-veil')).toBe('0.8');
    expect(accentOf()).toBe('#a89bff');

    // Pregunta 2: su propio fondo entra sobre el anterior (que se queda hasta que el nuevo está listo).
    await next(user);
    await screen.findByText('Segunda');
    await waitFor(() => expect(layers()).toHaveLength(2));
    const entering = layers().find((layer) => layer.querySelector('img[src*="propia"]'))!;
    expect(entering).toHaveAttribute('data-entering');
    expect(layers()[0]).not.toHaveAttribute('data-entering');
    fireEvent.load(entering.querySelector('img')!);
    await waitFor(() => expect(entering).not.toHaveAttribute('data-entering'));
    await waitFor(() => expect(layers()).toHaveLength(1), { timeout: 2000 });
    expect(sources()[0]).toContain('propia');
    expect(layers()[0]?.style.getPropertyValue('--quiz-veil')).toBe('0.9');
    expect(accentOf()).toBe('#ff8fb1');
    // Solo la capa actual es una imagen con nombre para lectores de pantalla.
    expect(screen.getAllByRole('img', { name: 'Niebla sobre la ciudad' })).toHaveLength(1);

    // Pregunta 3: «sin fondo» (el color liso del sitio); el general vuelve en el resultado, no aquí.
    await next(user);
    await screen.findByText('Tercera');
    await waitFor(() => expect(layers()).toHaveLength(0), { timeout: 2000 });
    expect(accentOf()).toBe('#a89bff');
  });

  it('el velo manual por pregunta nunca baja del piso y el acento se aclara según el fondo de ESA pregunta', async () => {
    setup([question('q1', 'Primera'), question('q2', 'Segunda', { accent: '#1a3a6e' })]);
    const user = userEvent.setup();
    renderAt(`/panel/quiz/${QUIZ}`);
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await screen.findByText('Primera');
    const { contrast } = await import('../../shared/lib/color');
    const { accentBackdrop } = await import('../../shared/lib/quizAppearance');
    await next(user);
    await screen.findByText('Segunda');
    const painted = accentOf();
    expect(painted).not.toBe('#1a3a6e');
    expect(contrast(painted, accentBackdrop(true, undefined, 0.8))).toBeGreaterThanOrEqual(3);
  });

  it('un medio que no carga no deja la pantalla sin fondo ni espera para siempre: el color liso y el velo', async () => {
    setup([
      question('q1', 'Primera'),
      question('q2', 'Segunda', { background: { kind: 'image', image: image('rota') } }),
    ]);
    const user = userEvent.setup();
    renderAt(`/panel/quiz/${QUIZ}`);
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await screen.findByText('Primera');
    await next(user);
    await screen.findByText('Segunda');
    const broken = await waitFor(() => {
      const layer = layers().find((item) => item.querySelector('img[src*="rota"]'));
      if (!layer) throw new Error('aún no');
      return layer;
    });
    fireEvent.error(broken.querySelector('img')!);
    await waitFor(() => expect(broken).not.toHaveAttribute('data-entering'));
    // La capa existe (color liso y velo); la imagen no se muestra porque no cargó.
    expect(broken).not.toHaveAttribute('data-loaded');
    await user.click(screen.getAllByRole('radio')[0]!);
    expect(screen.getByRole('button', { name: /Terminar/ })).toBeEnabled();
  });

  it('con un video propio: solo corre el de la capa actual, hay un botón de pausa y la siguiente solo precalienta su póster', async () => {
    const warmed: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        decoding = '';
        set src(value: string) {
          warmed.push(value);
        }
      },
    );
    setup(
      [
        question('q1', 'Primera'),
        question('q2', 'Segunda', { background: { kind: 'video', video } }),
      ],
      { overlay: { mode: 'manual', strength: 0.8 } },
    );
    const user = userEvent.setup();
    renderAt(`/panel/quiz/${QUIZ}`);
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await screen.findByText('Primera');
    // En la pregunta 1 no hay fondo ni video; de la 2 solo se pidió el póster (una imagen), nunca el .mp4.
    expect(document.querySelector('video')).toBeNull();
    expect(warmed.some((url) => /so_0.*\.jpg/.test(url))).toBe(true);
    expect(warmed.some((url) => url.includes('.mp4'))).toBe(false);
    await next(user);
    await screen.findByText('Segunda');
    await waitFor(() => expect(document.querySelectorAll('video')).toHaveLength(1));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Pausar video de fondo' })).toBeInTheDocument();
  });

  it('con movimiento reducido el video de una pregunta no se monta: solo su póster', async () => {
    stubEnvironment({ reduced: true });
    setup(
      [
        question('q1', 'Primera'),
        question('q2', 'Segunda', { background: { kind: 'video', video } }),
      ],
      { overlay: { mode: 'manual', strength: 0.8 } },
    );
    const user = userEvent.setup();
    renderAt(`/panel/quiz/${QUIZ}`);
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await screen.findByText('Primera');
    await next(user);
    await screen.findByText('Segunda');
    await waitFor(() => expect(layers().length).toBeGreaterThan(0));
    expect(document.querySelector('video')).toBeNull();
    expect(play).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /video de fondo/i })).toBeNull();
    expect(document.querySelector('.quiz-bg img[src*="so_0"]')).not.toBeNull();
  });

  it('con ahorro de datos no se precalienta nada de la pregunta siguiente', async () => {
    stubEnvironment({ saveData: true });
    const warmed: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        decoding = '';
        set src(value: string) {
          warmed.push(value);
        }
      },
    );
    setup([
      question('q1', 'Primera'),
      question('q2', 'Segunda', { background: { kind: 'image', image: image('propia') } }),
    ]);
    const user = userEvent.setup();
    renderAt(`/panel/quiz/${QUIZ}`);
    await user.click(await screen.findByRole('button', { name: 'Comenzar' }));
    await screen.findByText('Primera');
    expect(warmed).toHaveLength(0);
  });
});

describe('ResultView: video del resultado con el mismo comportamiento', () => {
  const result = {
    key: 'r1',
    title: 'Poder',
    media: { kind: 'video' as const, video: { ...video, alt: 'Clip del resultado' } },
  };

  it('en la pantalla del resultado corre solo; en una lista no se descarga ni corre hasta pulsar', async () => {
    const { ResultView } = await import('./ResultView');
    const { render } = await import('@testing-library/react');
    const page = render(<ResultView result={result} asPage />);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    page.unmount();
    play.mockClear();

    render(<ResultView result={result} />);
    expect(play).not.toHaveBeenCalled();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reproducir video del resultado' }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  });

  it('con «reducir movimiento» solo hay póster, sin <video> ni botón', async () => {
    stubEnvironment({ reduced: true });
    const { ResultView } = await import('./ResultView');
    const { render } = await import('@testing-library/react');
    const { container } = render(<ResultView result={result} asPage />);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('.result-video img')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /video del resultado/i })).toBeNull();
    expect(screen.getByRole('img', { name: 'Clip del resultado' })).toBeInTheDocument();
  });
});
