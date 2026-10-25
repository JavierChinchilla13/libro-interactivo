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
        accent: 'warning',
      }),
    });
    const { container } = renderAt(`/panel/quiz/${QUIZ}`);
    await screen.findByRole('heading', { name: '[PLACEHOLDER] Quiz 2' });
    expect(bg()?.style.getPropertyValue('--quiz-veil')).toBe('0.88');
    expect(
      (
        container.querySelector('[style*="--quiz-accent"]') as HTMLElement | null
      )?.style.getPropertyValue('--quiz-accent'),
    ).toBe('var(--token-warning)');
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
