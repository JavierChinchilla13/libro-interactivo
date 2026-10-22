import type { PublicSiteResponse } from '@libro/shared';
import { useEffect, useRef, useState } from 'react';
import { heightUrl } from '../../shared/lib/cloudinary';

type HeaderImage = NonNullable<PublicSiteResponse['universe']['headerImages']>[number];

const PLACEHOLDERS = [1.5, 0.8, 1.8, 0.66, 1.8];
/** Proporciones extremas se recortan con `object-fit: cover` para que una imagen futura no rompa la hilera. */
const RATIO_MIN = 0.6;
const RATIO_MAX = 1.8;

/** Con menos de 5 imágenes reales, en producción no se pinta nada (en desarrollo, marcadores de color). */
export function hasGrid(images: readonly HeaderImage[] | undefined): boolean {
  return (images !== undefined && images.length >= 5) || import.meta.env.DEV;
}

const ratioOf = (width: number, height: number) =>
  Math.min(RATIO_MAX, Math.max(RATIO_MIN, width / Math.max(1, height)));

/** Marcador de color (decorativo): nada que leer ni ninguna imagen que cargar. */
function Placeholder({ index, ratio }: { index: number; ratio: number }) {
  return (
    <li
      aria-hidden="true"
      className="tilted-tile tilted-tile-placeholder"
      data-tone={index % 3}
      style={{ aspectRatio: ratio }}
    />
  );
}

function Tile({ image, index, hidden }: { image: HeaderImage; index: number; hidden?: boolean }) {
  // Una imagen que no carga deja un hueco liso del mismo tamaño (sin icono roto ni texto alternativo desbordado).
  const [state, setState] = useState<'pending' | 'ready' | 'failed'>('pending');
  return (
    <li
      aria-hidden={hidden || state === 'failed' || undefined}
      className="tilted-tile"
      data-pending={state === 'pending' || undefined}
      style={{ aspectRatio: ratioOf(image.width, image.height), ['--i' as string]: index }}
    >
      <img
        src={heightUrl(image.url, 560)}
        alt={hidden ? '' : image.alt}
        width={image.width}
        height={image.height}
        // Las primeras se ven en la primera pantalla: se piden ya (con prioridad baja); el resto, al acercarse.
        loading={index < 3 && !hidden ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority="low"
        draggable={false}
        onLoad={() => setState('ready')}
        onError={() => setState('failed')}
        ref={(node) => {
          if (node?.complete && node.naturalWidth > 0) setState('ready');
        }}
        className={`img-frame size-full object-cover ${state === 'failed' ? 'invisible' : ''}`}
      />
    </li>
  );
}

/** Copias de la hilera que se pintan antes de medir (cubren hasta ~2500 px con una vuelta de ~1000 px). */
const DEFAULT_COPIES = 4;
const MIN_COPIES = 2;
const MAX_COPIES = 10;
/** Velocidad de la deriva sola en el celular (px/s): más lenta que la marquesina de escritorio. */
const PHONE_SPEED = 14;
/** Tras tocar o deslizar con el dedo, la deriva espera este tiempo antes de seguir. */
const PHONE_RESUME_MS = 3000;
/** Margen de seguridad (px) sobre el ancho: cubre el escorzo de la inclinación y el relleno de la hilera. */
const SAFETY_PX = 64;

/**
 * Cuántas copias de la hilera hacen falta para que nunca quede un hueco: la pista avanza una vuelta (`period`) y, en
 * ese momento, su borde derecho debe seguir pasado el borde derecho de la ventana: `(copias - 1) × vuelta ≥ ancho`.
 */
export function copiesFor(viewport: number, period: number): number {
  if (!(period > 0) || !(viewport > 0)) return DEFAULT_COPIES;
  return Math.min(MAX_COPIES, Math.max(MIN_COPIES, Math.ceil((viewport + SAFETY_PX) / period) + 1));
}

/**
 * Ejecuta `task` cuando la página ya cargó y el navegador está libre: ni la medida de las copias ni la deriva del
 * celular compiten con el primer pintado. Devuelve cómo cancelarla.
 */
function afterLoad(task: () => void): () => void {
  let cancelled = false;
  let cancelIdle = () => {};
  const run = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(task, { timeout: 2000 });
      cancelIdle = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(task, 300);
      cancelIdle = () => window.clearTimeout(id);
    }
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', run);
    cancelIdle();
  };
}

/**
 * Lo que mide una vuelta (de una imagen a la misma imagen de la copia siguiente). Se mide por posiciones (`offsetLeft`
 * no cambia con las transformaciones de la animación) y no dividiendo el ancho de la pista entre las copias, que
 * dependería de un valor que React aún no ha actualizado. Sin copias a la vista (movimiento reducido), mide la pista.
 */
function periodOf(strip: HTMLElement, setSize: number): number {
  const first = strip.children[0] as HTMLElement | undefined;
  const second = strip.children[setSize] as HTMLElement | undefined;
  if (first && second && second.offsetParent !== null) return second.offsetLeft - first.offsetLeft;
  return strip.offsetWidth;
}

/** Sigue un `matchMedia` y vuelve a pintar cuando cambia. */
function useMedia(query: string): boolean {
  const read = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Rejilla inclinada del encabezado: una hilera de imágenes a sangre, de altura fija y con la proporción propia de cada
 * una (sin deformarlas), que se curva hacia quien mira y se desvanece en los bordes. Va al pie del héroe, bajo la
 * frase principal.
 *
 * Es un bucle continuo: la hilera se repite las veces que hagan falta para cubrir cualquier ancho (`copiesFor`, se
 * recalcula al cambiar el tamaño) y avanza exactamente una vuelta por ciclo, así las imágenes salen por un lado y
 * entran por el otro sin huecos ni saltos. Las copias van ocultas a los lectores de pantalla. En pantallas anchas la
 * marquesina es solo `transform` (CSS, 45 s por vuelta); en el celular la hilera avanza sola, más despacio, y se
 * puede deslizar con el dedo (al tocar se detiene y sigue unos segundos después). Se pausa con el botón, con el cursor
 * encima, fuera de pantalla y con la pestaña oculta; con «reducir movimiento» queda quieta (sin copias) y solo se
 * desliza. Con menos de 5 imágenes propias, en desarrollo muestra marcadores de color y en producción no se pinta nada.
 */
export function TiltedGrid({ images }: { images: readonly HeaderImage[] | undefined }) {
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const narrow = useMedia('(max-width: 47.99rem)');
  const [paused, setPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Antes de medir: 2 copias bastan en un celular y 4 cubren hasta ~2500 px.
  const [measured, setMeasured] = useState(() => (narrow ? 2 : DEFAULT_COPIES));
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const real = images && images.length >= 5 ? images : undefined;
  const setSize = real ? real.length : PLACEHOLDERS.length;
  // Con movimiento reducido no hay copias: la hilera queda quieta.
  const copies = reduced ? 1 : measured;
  // Lo que leen los observadores y el bucle del celular sin volver a montarse.
  const live = useRef({ copies, setSize });
  useEffect(() => {
    live.current = { copies, setSize };
  });

  // Fuera de pantalla y con la pestaña oculta la hilera se detiene (no gasta cuadros en algo que nadie ve).
  useEffect(() => {
    const element = root.current;
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    let observer: IntersectionObserver | undefined;
    if (element && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => {
        if (entry) setOffscreen(!entry.isIntersecting);
      });
      observer.observe(element);
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
    };
  }, []);

  // Copias necesarias según el ancho de la ventana y lo que mide una vuelta (que cambia con el alto de la pantalla).
  useEffect(() => {
    const frame = stage.current;
    const strip = track.current;
    if (reduced || !frame || !strip || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const needed = copiesFor(frame.clientWidth, periodOf(strip, live.current.setSize));
      if (needed !== live.current.copies) setMeasured(needed);
    };
    let observer: ResizeObserver | undefined;
    const cancel = afterLoad(() => {
      observer = new ResizeObserver(measure);
      observer.observe(frame);
      observer.observe(strip);
      measure();
    });
    return () => {
      cancel();
      observer?.disconnect();
    };
  }, [reduced]);

  // Celular: la hilera avanza sola (scroll horizontal) y se puede deslizar con el dedo. En pantallas anchas lo hace el
  // CSS. El bucle solo corre mientras hace falta: en el celular, sin pausa, a la vista y con la pestaña visible.
  useEffect(() => {
    const frame = stage.current;
    const strip = track.current;
    if (!frame || !strip || !narrow || reduced || paused || offscreen || hidden) return;
    let raf = 0;
    let last = 0;
    let pos = frame.scrollLeft;
    let touching = false;
    let resumeAt = 0;
    const period = () => periodOf(strip, live.current.setSize);
    const hold = () => {
      touching = true;
    };
    const release = () => {
      touching = false;
      resumeAt = performance.now() + PHONE_RESUME_MS;
    };
    const onScroll = () => {
      const p = period();
      // El dedo (o la inercia) movió la hilera: se toma esa posición y se espera antes de seguir.
      if (Math.abs(frame.scrollLeft - pos) > 1.5) {
        pos = frame.scrollLeft;
        resumeAt = performance.now() + PHONE_RESUME_MS;
      }
      // Bucle: pasada una vuelta se vuelve al principio (las copias son idénticas, no se nota).
      if (p > 0 && frame.scrollLeft >= p) {
        frame.scrollLeft -= p;
        pos = frame.scrollLeft;
      }
    };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(64, now - last);
      last = now;
      if (touching || performance.now() < resumeAt) return;
      pos += (PHONE_SPEED * dt) / 1000;
      // Solo se escribe cuando el avance ya vale al menos un píxel físico (a 14 px/s son 0,23 px por cuadro).
      if (Math.abs(pos - frame.scrollLeft) >= 1 / (window.devicePixelRatio || 1)) {
        frame.scrollLeft = pos;
      }
    };
    frame.addEventListener('scroll', onScroll, { passive: true });
    frame.addEventListener('touchstart', hold, { passive: true });
    frame.addEventListener('touchend', release, { passive: true });
    frame.addEventListener('touchcancel', release, { passive: true });
    const cancelStart = afterLoad(() => {
      raf = requestAnimationFrame((now) => {
        last = now;
        raf = requestAnimationFrame(tick);
      });
    });
    return () => {
      cancelStart();
      cancelAnimationFrame(raf);
      frame.removeEventListener('scroll', onScroll);
      frame.removeEventListener('touchstart', hold);
      frame.removeEventListener('touchend', release);
      frame.removeEventListener('touchcancel', release);
    };
  }, [narrow, reduced, paused, offscreen, hidden]);

  if (!real && !import.meta.env.DEV) return null;
  const copyIndexes = Array.from({ length: copies }, (_, copy) => copy);
  return (
    <section
      ref={root}
      aria-label="Imágenes del universo"
      className="tilted-grid"
      data-paused={paused || undefined}
      data-offscreen={offscreen || undefined}
      data-hidden={hidden || undefined}
    >
      <div
        ref={stage}
        className="tilted-stage"
        // Cuando la hilera se desliza (celular o movimiento reducido) se puede recorrer con el teclado.
        tabIndex={narrow || reduced ? 0 : undefined}
        role={narrow || reduced ? 'group' : undefined}
        aria-label={narrow || reduced ? 'Imágenes del encabezado, se desplazan' : undefined}
      >
        <ul
          ref={track}
          className="tilted-track"
          style={{ ['--copies' as string]: copies }}
          data-copies={copies}
        >
          {copyIndexes.flatMap((copy) =>
            real
              ? real.map((image, index) => (
                  <Tile
                    key={`${copy}-${image.publicId}-${index}`}
                    image={image}
                    index={index}
                    hidden={copy > 0}
                  />
                ))
              : PLACEHOLDERS.map((ratio, index) => (
                  <Placeholder key={`${copy}-${index}`} index={index} ratio={ratio} />
                )),
          )}
        </ul>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-compact tilted-pause"
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? 'Reanudar animación' : 'Pausar animación'}
      </button>
    </section>
  );
}
