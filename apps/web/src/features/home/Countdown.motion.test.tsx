import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Countdown } from './Countdown';

type Callback = (entries: { isIntersecting: boolean }[]) => void;
let notify: Callback = () => undefined;

/** Registro de lo que se dibuja: cuántos `fillRect` entre un `clearRect` y el siguiente (un cuadro). */
const frames: number[] = [];
let current = 0;

function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = (() =>
    new Proxy(
      {},
      {
        get: (_target, name) => {
          if (name === 'getImageData') {
            // Todo el lienzo «pintado»: el máximo de puntos posible, para comprobar el tope.
            return (_x: number, _y: number, w: number, h: number) => ({
              data: new Uint8ClampedArray(w * h * 4).fill(255),
            });
          }
          if (name === 'fillRect') {
            return () => {
              current += 1;
            };
          }
          if (name === 'clearRect') {
            return () => {
              if (current > 0) frames.push(current);
              current = 0;
            };
          }
          return () => undefined;
        },
        set: () => true,
      },
    )) as unknown as HTMLCanvasElement['getContext'];
}

beforeEach(() => {
  frames.length = 0;
  current = 0;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: Callback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  stubCanvas();
  // jsdom no calcula medidas: cada número mide 80 × 60 px (suficiente para pasar el tope de partículas).
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 80,
    bottom: 60,
    width: 80,
    height: 60,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const soon = () => new Date(Date.now() + 3 * 3600_000);

describe('Countdown con movimiento permitido', () => {
  it('no monta ningún lienzo hasta estar en pantalla y entonces carga el de partículas', async () => {
    const { container } = render(<Countdown target={soon()} dateLabel="x" />);
    expect(container.querySelector('canvas')).toBeNull();
    act(() => notify([{ isIntersecting: true }]));
    await waitFor(() => expect(container.querySelectorAll('canvas').length).toBe(4));
    // En reposo se ve el número nítido del DOM, no las partículas.
    expect(container.querySelector('[data-vapor]')).toBeNull();
    expect(container.querySelector('.countdown-digits')).toBeInTheDocument();
  });

  it('solo al cambiar un número el lienzo toma el relevo, y al terminar el número vuelve a verse', async () => {
    const { container } = render(<Countdown target={soon()} dateLabel="x" />);
    act(() => notify([{ isIntersecting: true }]));
    await waitFor(() => expect(container.querySelectorAll('canvas').length).toBe(4));
    // Al pasar el segundo cambia el número de los segundos: el lienzo anima y el número del DOM se oculta…
    await waitFor(() => expect(container.querySelector('[data-vapor]')).not.toBeNull(), {
      timeout: 3000,
    });
    // …y cuando termina la transición vuelve el número nítido.
    await waitFor(() => expect(container.querySelector('[data-vapor]')).toBeNull(), {
      timeout: 3000,
    });
  }, 10_000);

  it.each([
    ['celular', 390, 120],
    ['escritorio', 1024, 400],
  ])(
    'en %s ningún cuadro dibuja más de dos veces el tope de partículas por número',
    async (_name, width, cap) => {
      Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
      const { container } = render(<Countdown target={soon()} dateLabel="x" />);
      act(() => notify([{ isIntersecting: true }]));
      await waitFor(() => expect(container.querySelectorAll('canvas').length).toBe(4));
      await waitFor(() => expect(frames.length).toBeGreaterThan(2), { timeout: 4000 });
      // Cada cuadro pinta las partículas que salen y las que llegan: nunca más del doble del tope.
      expect(Math.max(...frames)).toBeLessThanOrEqual(cap * 2);
      // Y el tope se alcanza de verdad (el lienzo de prueba está lleno), así que la prueba no es vacía.
      expect(Math.max(...frames)).toBeGreaterThan(cap);
    },
    10_000,
  );
});
