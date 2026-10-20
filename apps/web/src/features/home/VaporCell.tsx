import { useEffect, useRef, type RefObject } from 'react';

interface Point {
  x: number;
  y: number;
}

const ARRIVE_MS = 650;
const LEAVE_MS = 320;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Puntos del texto: se dibuja el valor en un lienzo aparte y se toma una muestra de los píxeles pintados. */
function sample(text: string, width: number, height: number, font: string, step: number): Point[] {
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2);
  const { data } = context.getImageData(0, 0, width, height);
  const points: Point[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) > 128) points.push({ x, y });
    }
  }
  return points;
}

/**
 * Un número hecho de partículas (canvas 2D propio, sin librerías). Al cambiar el valor, el anterior se eleva y se
 * desvanece y el nuevo se condensa desde el vapor. Solo anima mientras dura el cambio: después queda quieto y no
 * consume nada. Se pinta con el color y la fuente del texto real que tiene debajo.
 */
export default function VaporCell({
  value,
  reference,
  onReady,
}: {
  value: string;
  /** El texto real (accesible) cuya fuente, tamaño y color se copian. */
  reference: RefObject<HTMLElement | null>;
  onReady: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const previous = useRef<{ value: string; points: Point[] } | null>(null);

  useEffect(() => {
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
      const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 640 ? 1.5 : 2);
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }
      const font = `${style.fontWeight} ${parseFloat(style.fontSize) * dpr}px ${style.fontFamily}`;
      // Muestra de ~2 px de pantalla; si hay demasiadas partículas (tope para celulares), se afloja el paso.
      let step = Math.max(2, Math.round(1.8 * dpr));
      let points = sample(value, width, height, font, step);
      while (points.length > 900 && step < 8) {
        step += 1;
        points = sample(value, width, height, font, step);
      }
      const size = Math.max(1.5, step * 0.9);
      const leaving =
        previous.current && previous.current.value !== value ? previous.current.points : null;
      previous.current = { value, points };
      const rise = 14 * dpr;
      // De dónde sale cada partícula nueva: un punto al azar bajo su sitio (se calcula una vez por cambio).
      const origins = points.map((p) => ({
        x: p.x + (Math.random() - 0.5) * 18 * dpr,
        y: p.y + (0.4 + Math.random()) * 22 * dpr,
      }));
      context.fillStyle = style.color;

      const paint = (elapsed: number) => {
        context.clearRect(0, 0, width, height);
        if (leaving && elapsed < LEAVE_MS) {
          const t = easeOut(elapsed / LEAVE_MS);
          context.globalAlpha = 1 - t;
          for (const p of leaving) context.fillRect(p.x, p.y - rise * t, size, size);
        }
        const a = leaving ? easeOut(Math.min(1, elapsed / ARRIVE_MS)) : 1;
        context.globalAlpha = a;
        points.forEach((p, i) => {
          const o = origins[i];
          if (o) context.fillRect(o.x + (p.x - o.x) * a, o.y + (p.y - o.y) * a, size, size);
        });
        context.globalAlpha = 1;
      };

      onReady();
      if (!leaving) {
        paint(ARRIVE_MS);
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        paint(elapsed);
        if (elapsed < ARRIVE_MS && !cancelled) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [value, reference, onReady]);

  return <canvas ref={canvas} aria-hidden="true" className="countdown-canvas" />;
}
