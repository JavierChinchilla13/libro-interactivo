import type { ReaderCardDetail } from '@libro/shared';
import { useEffect, useRef, useState, type PointerEvent } from 'react';

/** Cuánto hay que arrastrar (px) para pasar de imagen; un gesto rápido cuenta con menos. */
const SWIPE_DISTANCE = 48;
const SWIPE_FAST_DISTANCE = 24;
const SWIPE_FAST_SPEED = 0.35; // px por milisegundo

/**
 * Galería de una carta: UNA imagen a la vez, flechas «‹ ›», deslizar con el dedo, «2 de 5», teclado (flechas, Inicio,
 * Fin) y el aviso de la posición para lectores de pantalla (`aria-live`). Sin transiciones con «reducir movimiento».
 * No usa ninguna librería de zoom ni de carrusel.
 */
export function CardGallery({ card }: { card: ReaderCardDetail }) {
  const total = card.images.length;
  const [index, setIndex] = useState(0);
  // Hacia dónde se movió (para que la imagen entre por ese lado); `null` en la primera imagen: entra sin animar.
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const current = card.images[index];

  function go(target: number) {
    const next = Math.min(Math.max(target, 0), total - 1);
    if (next === index) return;
    setDirection(next > index ? 'next' : 'prev');
    setIndex(next);
  }

  // La imagen que sigue (y la anterior) se piden de antemano: al pasar ya está.
  useEffect(() => {
    for (const neighbour of [card.images[index + 1], card.images[index - 1]]) {
      if (neighbour) new Image().src = neighbour.url;
    }
  }, [card.images, index]);

  // El teclado funciona con el foco en cualquier parte del diálogo (también en «Cerrar»), no solo sobre la galería.
  useEffect(() => {
    const host = root.current?.closest('dialog') ?? root.current;
    if (!host || total < 2) return undefined;
    const onKeyDown = (event: Event) => {
      const key = event as KeyboardEvent;
      if (key.altKey || key.ctrlKey || key.metaKey) return;
      let target: number;
      if (key.key === 'ArrowRight') target = Math.min(index + 1, total - 1);
      else if (key.key === 'ArrowLeft') target = Math.max(index - 1, 0);
      else if (key.key === 'Home') target = 0;
      else if (key.key === 'End') target = total - 1;
      else return;
      key.preventDefault();
      if (target === index) return;
      setDirection(target > index ? 'next' : 'prev');
      setIndex(target);
    };
    host.addEventListener('keydown', onKeyDown);
    return () => host.removeEventListener('keydown', onKeyDown);
  }, [index, total]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (total < 2 || !event.isPrimary) return;
    start.current = { x: event.clientX, y: event.clientY, at: event.timeStamp };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const from = start.current;
    start.current = null;
    if (!from || total < 2) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    const speed = Math.abs(dx) / Math.max(event.timeStamp - from.at, 1);
    const far = Math.abs(dx) >= SWIPE_DISTANCE;
    const quick = Math.abs(dx) >= SWIPE_FAST_DISTANCE && speed >= SWIPE_FAST_SPEED;
    // Solo un gesto sobre todo horizontal: un desplazamiento vertical no cambia de imagen.
    if ((far || quick) && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? index + 1 : index - 1);
  }

  if (!current) return null;
  const atStart = index === 0;
  const atEnd = index === total - 1;

  return (
    <div
      role={total > 1 ? 'group' : undefined}
      aria-roledescription={total > 1 ? 'galería' : undefined}
      aria-label={total > 1 ? `Imágenes de «${card.title}»` : undefined}
      ref={root}
      className="card-gallery"
    >
      <div
        className="card-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        {total > 1 ? (
          <button
            type="button"
            className="card-nav card-nav-prev"
            aria-label="Imagen anterior"
            aria-disabled={atStart}
            onClick={() => go(index - 1)}
          >
            <span aria-hidden="true">‹</span>
          </button>
        ) : null}
        <img
          // Cambiar de imagen reinicia la entrada (una animación nueva por imagen).
          key={current.url}
          src={current.url}
          alt={current.alt}
          width={current.width}
          height={current.height}
          draggable={false}
          className="card-slide"
          data-direction={direction ?? undefined}
        />
        {total > 1 ? (
          <button
            type="button"
            className="card-nav card-nav-next"
            aria-label="Imagen siguiente"
            aria-disabled={atEnd}
            onClick={() => go(index + 1)}
          >
            <span aria-hidden="true">›</span>
          </button>
        ) : null}
      </div>
      {total > 1 ? (
        <p className="card-counter" role="status" aria-live="polite" aria-atomic="true">
          <span className="sr-only">Imagen </span>
          {index + 1} de {total}
        </p>
      ) : null}
    </div>
  );
}
