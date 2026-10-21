import { useEffect, useRef, type RefObject } from 'react';

interface Point {
  x: number;
  y: number;
}

const ARRIVE_MS = 650;
const LEAVE_MS = 320;
/** Tope de partículas por número: en el celular, el rango del plan (60 a 120); en pantallas anchas, más. */
const BUDGET = { small: 120, large: 400 } as const;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Puntos del texto: se dibuja el valor en un lienzo aparte y se toma una muestra de los píxeles pintados. Si salen más
 * de `cap`, el paso se afloja hasta cumplir el tope.
 */
function sample(
  text: string,
  width: number,
  height: number,
  font: string,
  startStep: number,
  cap: number,
): { points: Point[]; step: number } {
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext('2d', { willReadFrequently: true });
  if (!context) return { points: [], step: startStep };
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2);
  const { data } = context.getImageData(0, 0, width, height);
  for (let step = startStep; ; step += 1) {
    const points: Point[] = [];
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        if ((data[(y * width + x) * 4 + 3] ?? 0) > 128) points.push({ x, y });
      }
    }
    if (points.length <= cap || step >= 16) return { points, step };
  }
}

/** Los puntos de un dígito no cambian entre un segundo y el siguiente: solo hay diez dígitos por tamaño y fuente. */
const cache = new Map<string, { points: Point[]; step: number }>();

function cachedSample(
  text: string,
  width: number,
  height: number,
  font: string,
  startStep: number,
  cap: number,
) {
  const key = `${text}|${font}|${width}x${height}|${startStep}|${cap}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const made = sample(text, width, height, font, startStep, cap);
  if (cache.size >= 60) cache.clear();
  cache.set(key, made);
  return made;
}

/**
 * La transición de un número (canvas 2D propio, sin librerías): el valor anterior se eleva y se desvanece y el nuevo se
 * condensa desde el vapor. El número real (en el DOM) es lo que se ve y se lee siempre: el lienzo solo se muestra
 * mientras dura el cambio (`onActive`), así que en reposo no cuesta nada y el número se ve nítido. Usa la fuente, el
 * tamaño y el color del texto real.
 */
export default function VaporCell({
  value,
  reference,
  onActive,
}: {
  value: string;
  /** El texto real (accesible) cuya fuente, tamaño y color se copian. */
  reference: RefObject<HTMLElement | null>;
  onActive: (active: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    // El primer valor se ve tal cual (texto nítido); solo los cambios se animan.
    if (before === null || before === value) return;
    const element = canvas.current;
    const source = reference.current;
    const context = element?.getContext('2d');
    if (!element || !source || !context) return;
    let frame = 0;
    let cancelled = false;

    const run = async () => {
      await document.fonts?.ready;
      if (cancelled) return;
      const box = source.getBoundingClientRect();
      const style = getComputedStyle(source);
      const small = window.innerWidth < 640;
      const cap = small ? BUDGET.small : BUDGET.large;
      const dpr = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.75);
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      element.width = width;
      element.height = height;
      const font = `${style.fontWeight} ${parseFloat(style.fontSize) * dpr}px ${style.fontFamily}`;
      const startStep = Math.max(2, Math.round(1.8 * dpr));
      const next = cachedSample(value, width, height, font, startStep, cap);
      const last = cachedSample(before, width, height, font, startStep, cap);
      const size = Math.max(1.5, Math.max(next.step, last.step) * 0.9);
      const rise = 14 * dpr;
      // De dónde sale cada partícula nueva: un punto al azar bajo su sitio (se calcula una vez por cambio).
      const origins = next.points.map((p) => ({
        x: p.x + (Math.random() - 0.5) * 18 * dpr,
        y: p.y + (0.4 + Math.random()) * 22 * dpr,
      }));
      context.fillStyle = style.color;

      const paint = (elapsed: number) => {
        context.clearRect(0, 0, width, height);
        if (elapsed < LEAVE_MS) {
          const t = easeOut(elapsed / LEAVE_MS);
          context.globalAlpha = 1 - t;
          for (const p of last.points) context.fillRect(p.x, p.y - rise * t, size, size);
        }
        const a = easeOut(Math.min(1, elapsed / ARRIVE_MS));
        context.globalAlpha = a;
        next.points.forEach((p, i) => {
          const o = origins[i];
          if (o) context.fillRect(o.x + (p.x - o.x) * a, o.y + (p.y - o.y) * a, size, size);
        });
        context.globalAlpha = 1;
      };

      onActive(true);
      const start = performance.now();
      let lastPaint = -Infinity;
      const tick = () => {
        if (cancelled) return;
        // El mismo reloj que `start` (no el argumento de rAF): así el tiempo transcurrido nunca queda desfasado.
        const now = performance.now();
        const elapsed = now - start;
        if (elapsed >= ARRIVE_MS) {
          context.clearRect(0, 0, width, height);
          onActive(false);
          return;
        }
        frame = requestAnimationFrame(tick);
        // Como mucho 30 dibujos por segundo (una pantalla de 60 Hz no necesita el doble para esto).
        if (now - lastPaint < 31) return;
        lastPaint = now;
        paint(elapsed);
      };
      frame = requestAnimationFrame(tick);
    };
    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      onActive(false);
    };
  }, [value, reference, onActive]);

  return <canvas ref={canvas} aria-hidden="true" className="countdown-canvas" />;
}
