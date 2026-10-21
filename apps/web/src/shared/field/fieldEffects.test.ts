import { FIELD_VISUAL_KEYS } from '@libro/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PARTICLE_BUDGET,
  budgetFor,
  createEffect,
  isLowPowerDevice,
  mountEffect,
} from './fieldEffects';

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

const setNavigator = (props: Record<string, unknown>) => {
  for (const [name, value] of Object.entries(props)) {
    Object.defineProperty(navigator, name, { value, configurable: true });
  }
};

beforeEach(() => {
  // Un equipo normal: ni poca memoria ni pocos núcleos ni ahorro de datos.
  setNavigator({ hardwareConcurrency: 8, deviceMemory: undefined, connection: undefined });
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
    async (key) => {
      const calls: string[] = [];
      const raf = vi.spyOn(window, 'requestAnimationFrame');
      const mounted = await mountEffect(makeCanvas(calls), key, { reduced: true });
      expect(calls.length).toBeGreaterThan(0);
      mounted.resume();
      expect(raf).not.toHaveBeenCalled();
      mounted.destroy();
    },
  );

  it.each(FIELD_VISUAL_KEYS)(
    '«%s» anima al reanudar y se detiene al pausar y destruir',
    async (key) => {
      const calls: string[] = [];
      let queued = 0;
      const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => ++queued);
      const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
      const mounted = await mountEffect(makeCanvas(calls), key, { reduced: false });
      mounted.resume();
      expect(raf).toHaveBeenCalledTimes(1);
      mounted.pause();
      expect(cancel).toHaveBeenCalled();
      mounted.destroy();
      raf.mockRestore();
      cancel.mockRestore();
    },
  );
});

describe('tope de partículas', () => {
  const phone = { w: 390, h: 240, small: true };
  const desktop = { w: 1100, h: 320, small: false };

  it.each(FIELD_VISUAL_KEYS)('«%s» en el celular nunca pasa de 120 elementos', async (key) => {
    expect(PARTICLE_BUDGET[key].small).toBeLessThanOrEqual(120);
    expect((await createEffect(key, phone)).count).toBeLessThanOrEqual(120);
    expect((await createEffect(key, phone)).count).toBeLessThanOrEqual(budgetFor(key, true));
  });

  it('el valor de pantallas anchas nunca se usa en el celular y sí en escritorio', async () => {
    for (const key of FIELD_VISUAL_KEYS) {
      expect(PARTICLE_BUDGET[key].small).toBeLessThanOrEqual(PARTICLE_BUDGET[key].large);
    }
    // Los que más pesan: el campo de flujo (520) y la lluvia (700) solo en escritorio.
    expect((await createEffect('field', phone)).count).toBe(120);
    expect((await createEffect('field', desktop)).count).toBe(520);
    expect((await createEffect('rain', phone)).count).toBeLessThanOrEqual(120);
    expect((await createEffect('rain', desktop)).count).toBeGreaterThan(120);
    expect((await createEffect('rain', desktop)).count).toBeLessThanOrEqual(700);
  });

  it('los de red y constelaciones quedan en el rango de 60 a 120 en el celular', async () => {
    for (const key of ['neural', 'constellation', 'field', 'rain'] as const) {
      expect((await createEffect(key, phone)).count).toBeGreaterThanOrEqual(60);
    }
  });
});

describe('equipos con poca capacidad', () => {
  it('se detectan por poca memoria, pocos núcleos o ahorro de datos', () => {
    setNavigator({ hardwareConcurrency: 8, deviceMemory: 8, connection: undefined });
    expect(isLowPowerDevice()).toBe(false);
    setNavigator({ deviceMemory: 2 });
    expect(isLowPowerDevice()).toBe(true);
    setNavigator({ deviceMemory: 8, hardwareConcurrency: 2 });
    expect(isLowPowerDevice()).toBe(true);
    setNavigator({ hardwareConcurrency: 8, connection: { saveData: true } });
    expect(isLowPowerDevice()).toBe(true);
  });

  it.each(FIELD_VISUAL_KEYS)(
    '«%s» queda como cuadro estático, sin fotogramas ni oyentes de puntero',
    async (key) => {
      setNavigator({ deviceMemory: 1 });
      const calls: string[] = [];
      const raf = vi.spyOn(window, 'requestAnimationFrame');
      const canvas = makeCanvas(calls);
      const add = vi.spyOn(canvas.parentElement as HTMLElement, 'addEventListener');
      const mounted = await mountEffect(canvas, key, { reduced: false });
      expect(calls.length).toBeGreaterThan(0);
      mounted.resume();
      expect(raf).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
      mounted.destroy();
    },
  );
});

describe('fotogramas', () => {
  it.each(FIELD_VISUAL_KEYS)(
    '«%s» ejecuta varios fotogramas seguidos sin fallar y dibuja en cada uno',
    async (key) => {
      const calls: string[] = [];
      const queue: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => queue.push(cb));
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
      const mounted = await mountEffect(makeCanvas(calls), key, { reduced: false });
      mounted.resume();
      let now = performance.now();
      let frames = 0;
      for (let i = 0; i < 6; i += 1) {
        const next = queue.shift();
        if (!next) break;
        const before = calls.length;
        now += 34; // un fotograma a 30 por segundo
        next(now);
        frames += 1;
        expect(calls.length, `fotograma ${i}`).toBeGreaterThan(before);
      }
      expect(frames).toBe(6);
      mounted.destroy();
    },
  );

  it('con una pantalla de 60 Hz (un fotograma cada 16,7 ms) se dibuja uno de cada dos, no uno de cada tres', async () => {
    const calls: string[] = [];
    const queue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => queue.push(cb));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const mounted = await mountEffect(makeCanvas(calls), 'constellation', { reduced: false });
    mounted.resume();
    let now = performance.now();
    let drawn = 0;
    for (let i = 0; i < 30; i += 1) {
      const next = queue.shift();
      if (!next) break;
      const before = calls.length;
      now += 16.7;
      next(now);
      if (calls.length > before) drawn += 1;
    }
    // 30 fotogramas de 16,7 ms = 0,5 s: a 30 por segundo son ~15 dibujos (nunca ~10).
    expect(drawn).toBeGreaterThanOrEqual(13);
    expect(drawn).toBeLessThanOrEqual(16);
    mounted.destroy();
  });
});
