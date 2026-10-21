import type { ImageRef } from '@libro/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { thumbUrl } from '../lib/cloudinary';

export interface CoverflowItem {
  id: string;
  image: ImageRef;
  /** Lo que lee un lector de pantalla en el botón de la imagen. */
  label: string;
  /** Texto bajo el carrusel mientras esta imagen está al centro. */
  caption?: ReactNode;
}

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** La imagen de una tarjeta; si no carga, queda el hueco liso (sin icono roto ni texto alternativo desbordado). */
function CoverImage({ item, eager }: { item: CoverflowItem; eager: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={thumbUrl(item.image.url, 640)}
      alt={item.image.alt}
      width={item.image.width}
      height={item.image.height}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={failed ? 'invisible' : undefined}
    />
  );
}

/**
 * Carrusel «coverflow»: imágenes en una hilera con ajuste al centro; la del medio de frente y las de los lados
 * inclinadas. El desplazamiento es el del navegador (táctil con inercia, rueda, teclado), así que siempre sigue al dedo
 * y se puede interrumpir. La inclinación la dibuja CSS con una línea de tiempo de desplazamiento (solo `transform` y
 * `opacity`, sin JavaScript por fotograma); donde el navegador no la soporta o hay «reducir movimiento» queda como una
 * hilera plana con el mismo ajuste. Flechas, ← → Inicio Fin y botones Anterior/Siguiente.
 */
export function Coverflow({
  items,
  label,
  onOpen,
}: {
  items: readonly CoverflowItem[];
  label: string;
  onOpen: (index: number) => void;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const frame = useRef(0);

  /** El elemento más cercano al centro del carrusel es el activo (solo se actualiza el estado si cambia). */
  const measure = useCallback(() => {
    const element = track.current;
    if (!element) return;
    const center = element.scrollLeft + element.clientWidth / 2;
    let best = 0;
    let distance = Infinity;
    Array.from(element.children).forEach((child, index) => {
      const item = child as HTMLElement;
      const gap = Math.abs(item.offsetLeft + item.offsetWidth / 2 - center);
      if (gap < distance) {
        distance = gap;
        best = index;
      }
    });
    setActive((current) => (current === best ? current : best));
  }, []);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const onScroll = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(measure);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame.current);
    };
  }, [measure]);

  const goTo = (index: number) => {
    const element = track.current;
    const target = element?.children[Math.max(0, Math.min(items.length - 1, index))] as
      HTMLElement | undefined;
    if (!element || !target) return;
    element.scrollTo({
      left: target.offsetLeft + target.offsetWidth / 2 - element.clientWidth / 2,
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
  };

  const current = items[active];
  return (
    <div className="coverflow" role="group" aria-roledescription="carrusel" aria-label={label}>
      <ul
        ref={track}
        className="coverflow-track"
        tabIndex={0}
        aria-label={`${label}: usa las flechas del teclado para moverte`}
        onKeyDown={(event) => {
          const next: Record<string, number> = {
            ArrowLeft: active - 1,
            ArrowRight: active + 1,
            Home: 0,
            End: items.length - 1,
          };
          const index = next[event.key];
          if (index === undefined) return;
          event.preventDefault();
          goTo(index);
        }}
      >
        {items.map((item, index) => (
          <li key={item.id} className="coverflow-item">
            <button
              type="button"
              className="coverflow-card img-frame"
              aria-label={item.label}
              aria-current={index === active || undefined}
              onClick={() => (index === active ? onOpen(index) : goTo(index))}
            >
              <CoverImage item={item} eager={index < 3} />
            </button>
          </li>
        ))}
      </ul>
      <div className="coverflow-bar">
        <button
          type="button"
          className="btn btn-secondary btn-compact coverflow-nav"
          disabled={active === 0}
          onClick={() => goTo(active - 1)}
        >
          <span aria-hidden="true">‹</span>
          <span className="sr-only">Anterior</span>
        </button>
        <div className="coverflow-caption" aria-live="off">
          {current?.caption}
          <p className="sr-only">
            Imagen {active + 1} de {items.length}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-compact coverflow-nav"
          disabled={active === items.length - 1}
          onClick={() => goTo(active + 1)}
        >
          <span aria-hidden="true">›</span>
          <span className="sr-only">Siguiente</span>
        </button>
      </div>
    </div>
  );
}
