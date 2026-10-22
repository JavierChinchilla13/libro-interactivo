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

/**
 * Rejilla inclinada del encabezado: una hilera de imágenes a sangre, de altura fija y con la proporción propia de cada
 * una (sin deformarlas), que se curva hacia quien mira y se desvanece en los bordes. Va al pie del héroe, bajo la
 * frase principal. Solo anima `transform`: en pantallas anchas es una marquesina lenta (se pausa con el botón, con el
 * cursor encima, fuera de pantalla y con la pestaña oculta); en el celular y con «reducir movimiento» queda quieta y se
 * desliza con el dedo. Cada imagen entra con un fundido corto cuando termina de cargar.
 * Con menos de 5 imágenes propias, en desarrollo muestra marcadores de color y en producción no se pinta nada.
 */
export function TiltedGrid({ images }: { images: readonly HeaderImage[] | undefined }) {
  const [paused, setPaused] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const real = images && images.length >= 5 ? images : undefined;

  // Fuera de pantalla la marquesina se detiene (no gasta cuadros en algo que nadie ve).
  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setOffscreen(!entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!real && !import.meta.env.DEV) return null;
  return (
    <section
      ref={root}
      aria-label="Imágenes del universo"
      className="tilted-grid"
      data-paused={paused || undefined}
      data-offscreen={offscreen || undefined}
    >
      <div className="tilted-stage">
        <ul className="tilted-track">
          {real
            ? real.map((image, index) => (
                <Tile key={`${image.publicId}-${index}`} image={image} index={index} />
              ))
            : PLACEHOLDERS.map((ratio, index) => (
                <Placeholder key={index} index={index} ratio={ratio} />
              ))}
          {real
            ? real.map((image, index) => (
                <Tile key={`${image.publicId}-${index}-copy`} image={image} index={index} hidden />
              ))
            : PLACEHOLDERS.map((ratio, index) => (
                <Placeholder key={`${index}-copy`} index={index} ratio={ratio} />
              ))}
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
