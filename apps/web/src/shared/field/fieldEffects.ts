import type { FieldVisualKey } from '@libro/shared';
import type { Effect, Scale } from './effectKit';

export { PARTICLE_BUDGET, budgetFor } from './effectKit';

/**
 * Ejecutor de los fondos animados de los campos de poder. Este módulo es pequeño y solo se descarga cuando un campo entra
 * en pantalla; cada efecto vive en su propio archivo y se descarga aparte (solo el de ese campo). El ejecutor se ocupa de
 * los fotogramas (máx. 30 por segundo), la resolución, la pausa y la imagen estática con «reducir movimiento». Se dibuja
 * sobre un lienzo transparente: el degradado de fondo lo pone el CSS.
 */

const LOADERS: Record<FieldVisualKey, () => Promise<{ default: (scale: Scale) => Effect }>> = {
  rain: () => import('./effects/rain'),
  neural: () => import('./effects/neural'),
  constellation: () => import('./effects/constellation'),
  gradient: () => import('./effects/gradient'),
  field: () => import('./effects/field'),
  neon: () => import('./effects/neon'),
};

/** Crea un efecto (también sirve para comprobar sus topes sin lienzo). */
export async function createEffect(key: FieldVisualKey, scale: Scale): Promise<Effect> {
  return (await LOADERS[key]()).default(scale);
}

export interface MountedEffect {
  pause(): void;
  resume(): void;
  destroy(): void;
}

const FRAME_MS = 1000 / 30;

/**
 * Equipos con poca capacidad (poca memoria o pocos núcleos) o con «ahorro de datos»: ven el cuadro estático, igual que
 * quien pide menos movimiento. El fondo es decorativo: nunca vale la pena arriesgar la fluidez de la página.
 */
export function isLowPowerDevice(): boolean {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return (
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) ||
    (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) ||
    nav.connection?.saveData === true
  );
}

/**
 * Pone el efecto en el lienzo. Con `reduced` pinta un solo cuadro ya «avanzado» (imagen estática). Se pausa y se
 * reanuda desde fuera; `destroy` suelta todo. Tope de resolución: 1.25× en celulares y 1.75× en pantallas anchas.
 */
export async function mountEffect(
  canvas: HTMLCanvasElement,
  key: FieldVisualKey,
  options: { reduced: boolean },
): Promise<MountedEffect> {
  const context = canvas.getContext('2d');
  const factory = (await LOADERS[key]()).default;
  const still = options.reduced || isLowPowerDevice();
  let effect: Effect | null = null;
  let box: DOMRect | null = null;
  let frame = 0;
  let last = 0;
  let running = false;
  let resizeTimer = 0;

  const build = () => {
    if (!context) return;
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const small = w < 640;
    // El degradado rellena todo el lienzo varias veces por cuadro: en el celular se dibuja sin resolución extra.
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      small ? (key === 'gradient' ? 1 : 1.25) : 1.75,
    );
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, w, h);
    effect = factory({ w, h, small });
    box = canvas.getBoundingClientRect();
    if (still) {
      for (let i = 0; i < 90; i += 1) {
        effect.step(FRAME_MS);
        if (effect.trails || i === 89) effect.draw(context);
      }
    }
  };

  const tick = (now: number) => {
    if (!running || !effect || !context) return;
    frame = requestAnimationFrame(tick);
    const dt = now - last;
    // Margen de 2 ms: a 60 Hz un fotograma llega cada ~16,7 ms y sin él se perdería uno de cada tres.
    if (dt < FRAME_MS - 2) return;
    last = now;
    effect.step(Math.min(dt, 100));
    if (!effect.trails) context.clearRect(0, 0, canvas.width, canvas.height);
    effect.draw(context);
  };

  const onMove = (event: PointerEvent) => {
    if (!box) return;
    effect?.pointer?.(event.clientX - box.left, event.clientY - box.top);
  };
  const onEnter = () => {
    box = canvas.getBoundingClientRect();
  };
  const onLeave = () => effect?.pointer?.(-1, -1);
  // `ResizeObserver` avisa una vez al empezar a observar: esa primera notificación no es un cambio de tamaño.
  let firstNotice = true;
  const observer = new ResizeObserver(() => {
    if (firstNotice) {
      firstNotice = false;
      return;
    }
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(build, 150);
  });

  build();
  // También en el cuadro estático: al girar el equipo se vuelve a pintar a la medida nueva.
  observer.observe(canvas);
  if (!still) {
    canvas.parentElement?.addEventListener('pointerenter', onEnter, { passive: true });
    canvas.parentElement?.addEventListener('pointermove', onMove, { passive: true });
    canvas.parentElement?.addEventListener('pointerleave', onLeave, { passive: true });
  }
  const parent = canvas.parentElement;

  return {
    pause() {
      running = false;
      cancelAnimationFrame(frame);
    },
    resume() {
      if (running || still) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    },
    destroy() {
      running = false;
      cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      parent?.removeEventListener('pointerenter', onEnter);
      parent?.removeEventListener('pointermove', onMove);
      parent?.removeEventListener('pointerleave', onLeave);
    },
  };
}
