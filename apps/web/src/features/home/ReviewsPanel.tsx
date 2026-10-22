import type { PublicReview } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { communityApi, communityKeys } from '../community/api';

/** Lo que dura la salida del panel (CSS, ver `.reviews-panel[data-closing]`). Sin movimiento no hay salida animada. */
const CLOSE_MS = 220;

/** Una reseña con la misma tarjeta de la portada. Es texto plano: React lo escapa, nunca se interpreta como HTML. */
function PanelReview({ review }: { review: PublicReview }) {
  return (
    <li className="review-frame">
      <figure className="review-card">
        <blockquote className="font-read text-lg leading-relaxed [overflow-wrap:anywhere]">
          “{review.text}”
        </blockquote>
        <figcaption className="mt-auto flex flex-col gap-1">
          <p className="text-sm font-medium">
            {review.authorName}
            {review.source ? (
              <span className="font-normal text-muted"> · {review.source}</span>
            ) : null}
          </p>
          {review.rating ? (
            <p className="text-sm tabular-nums text-muted">Valoración: {review.rating} de 5</p>
          ) : null}
        </figcaption>
      </figure>
    </li>
  );
}

/**
 * Panel con todas las reseñas: en escritorio un panel lateral desde la derecha con las reseñas en dos columnas y
 * scroll propio; en el celular una hoja que sube desde abajo a casi pantalla completa. Usa `<dialog>` modal: el
 * navegador atrapa el foco, inerta el resto de la página y cierra con Escape; además se cierra con el botón y con un
 * toque fuera, y el foco vuelve al botón que lo abrió (`onClose` lo devuelve). Con «reducir movimiento» entra y sale
 * sin animación. Las reseñas se piden al abrirlo (hasta 50, el tope del servidor).
 */
export function ReviewsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const reviews = useQuery({
    queryKey: communityKeys.reviewsAll,
    queryFn: () => communityApi.reviews(50),
    enabled: open,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const requestClose = useCallback(() => {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, CLOSE_MS);
  }, [onClose]);

  const onBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const outside =
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom;
    if (outside) requestClose();
  };

  return (
    <dialog
      ref={dialog}
      className="reviews-panel"
      aria-labelledby="reviews-panel-title"
      data-closing={closing || undefined}
      onCancel={(event) => {
        // Escape: se cierra con la misma salida que el botón.
        event.preventDefault();
        requestClose();
      }}
      onClick={onBackdrop}
    >
      {open ? (
        <>
          <div className="reviews-panel-head">
            <h2 id="reviews-panel-title" className="section-title text-2xl">
              Reseñas de lectores
            </h2>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              autoFocus
              onClick={requestClose}
            >
              Cerrar
            </button>
          </div>
          <div className="reviews-panel-body">
            {reviews.isPending ? (
              <p role="status" className="text-muted">
                Cargando las reseñas…
              </p>
            ) : reviews.isError ? (
              <div className="flex flex-col items-start gap-3">
                <p>No pudimos cargar las reseñas.</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void reviews.refetch()}
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <ul className="reviews-panel-list" aria-label="Todas las reseñas">
                {reviews.data.reviews.map((review) => (
                  <PanelReview key={review.id} review={review} />
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </dialog>
  );
}
