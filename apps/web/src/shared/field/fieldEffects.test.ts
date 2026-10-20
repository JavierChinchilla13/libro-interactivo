import { FIELD_VISUAL_KEYS } from '@libro/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEffect } from './fieldEffects';

/** Contexto 2D de mentira: acepta cualquier llamada y las anota (jsdom no trae canvas). */
function fakeContext(calls: string[]) {
  const gradient = { addColorStop: () => undefined };
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === 'createRadialGradient') return () => gradient;
        return (..._args: unknown[]) => {
          calls.push(String(name));
        };
      },
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

function makeCanvas(calls: string[]) {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  host.append(canvas);
  Object.defineProperty(canvas, 'clientWidth', { value: 480 });
  Object.defineProperty(canvas, 'clientHeight', { value: 240 });
  canvas.getContext = (() => fakeContext(calls)) as unknown as HTMLCanvasElement['getContext'];
  return canvas;
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'Path2D',
    class {
      moveTo() {}
      lineTo() {}
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('fieldEffects', () => {
  it.each(FIELD_VISUAL_KEYS)(
    '«%s» pinta un cuadro estático con movimiento reducido y no arranca fotogramas',
    (key) => {
      const calls: string[] = [];
      const raf = vi.spyOn(window, 'requestAnimationFrame');
      const mounted = mountEffect(makeCanvas(calls), key, { reduced: true });
      expect(calls.length).toBeGreaterThan(0);
      mounted.resume();
      expect(raf).not.toHaveBeenCalled();
      mounted.destroy();
    },
  );

  it.each(FIELD_VISUAL_KEYS)('«%s» anima al reanudar y se detiene al pausar y destruir', (key) => {
    const calls: string[] = [];
    let queued = 0;
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => ++queued);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const mounted = mountEffect(makeCanvas(calls), key, { reduced: false });
    mounted.resume();
    expect(raf).toHaveBeenCalledTimes(1);
    mounted.pause();
    expect(cancel).toHaveBeenCalled();
    mounted.destroy();
    raf.mockRestore();
    cancel.mockRestore();
  });
});
