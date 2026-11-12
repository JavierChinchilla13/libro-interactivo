import type { ReaderCard } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { usePageMeta } from '../../shared/seo/usePageMeta';
import { ApiClientError } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/messages';
import { Alert, EmptyState, Loading, PageHeader } from '../../shared/ui/layout';
import { cardKeys, cardsApi } from './api';
import { CardGallery } from './CardGallery';
import './cards.css';
import { useCardsLabel } from './useCardsLabel';

/** Una carta abierta en la cuadrícula: la portada y el título (la imagen cabe entera, sin recortarse). */
function CardTile({ card }: { card: ReaderCard }) {
  return (
    <li>
      <Link to={`/panel/cartas/${card.id}`} className="card-tile" aria-label={card.title}>
        <span className="card-frame">
          <img
            src={card.imageUrl}
            alt={card.alt}
            width={card.width}
            height={card.height}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </span>
        <span className="card-tile-title">{card.title}</span>
        {card.imageCount > 1 ? (
          <span className="card-tile-meta tabular-nums">{card.imageCount} imágenes</span>
        ) : null}
      </Link>
    </li>
  );
}

/** Una carta que falta abrir (solo si `CARDS_SHOW_LOCKED` está encendido): sin título, sin imagen. */
function LockedTile() {
  return (
    <li>
      <div className="card-tile card-tile-locked" role="img" aria-label="Todavía bloqueada">
        <span className="card-frame">
          <span aria-hidden="true" className="card-lock">
            ?
          </span>
        </span>
        <span className="card-tile-title">Bloqueada</span>
      </div>
    </li>
  );
}

/**
 * Vista grande de una carta, en un diálogo nativo (`<dialog>`): foco dentro, Escape que cierra y el foco que vuelve a
 * donde estaba. La dirección (`/panel/cartas/:id`) abre la carta, así se puede compartir el enlace (solo sirve a quien
 * ya la abrió) y el botón «atrás» del navegador la cierra.
 */
function CardDialog({ cardId }: { cardId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const dialog = useRef<HTMLDialogElement>(null);
  const label = useCardsLabel();
  const card = useQuery({
    queryKey: cardKeys.one(cardId),
    queryFn: () => cardsApi.get(cardId),
    retry: false,
  });

  useEffect(() => {
    const element = dialog.current;
    // Un navegador sin `<dialog>` modal (o un entorno de pruebas) lo muestra igual, sin el foco atrapado.
    // Al salir de la pantalla no se cierra a mano: el diálogo se quita del documento junto con ella (y un cierre
    // «a mano» en esa limpieza, con React en desarrollo, volvía a mandar a la lista por el evento `close`).
    if (element && !element.open) {
      if (typeof element.showModal === 'function') element.showModal();
      else element.setAttribute('open', '');
    }
  }, []);

  /** Cerrar vuelve a la lista: un paso atrás si se llegó desde ella; si se entró directo por el enlace, a la lista. */
  const close = () => {
    if (location.key !== 'default') void navigate(-1);
    else void navigate('/panel/cartas', { replace: true });
  };
  const missing = card.error instanceof ApiClientError && card.error.status === 404;

  return (
    <dialog
      ref={dialog}
      className="card-dialog"
      aria-labelledby="card-dialog-title"
      onClose={close}
      onClick={(event) => {
        // Un toque en el fondo (fuera del cuadro) cierra, como en los diálogos del sitio.
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="card-dialog-inner">
        <header className="card-dialog-head">
          <div className="min-w-0">
            <h2 id="card-dialog-title" className="card-dialog-title">
              {card.data?.title ?? label}
            </h2>
            {card.data ? <p className="card-dialog-book">{card.data.bookTitle}</p> : null}
          </div>
          <button
            type="button"
            className="card-close"
            aria-label="Cerrar"
            onClick={() => dialog.current?.close()}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </header>
        {card.isPending ? <Loading label="Abriendo…" /> : null}
        {card.isError ? (
          <Alert>
            {missing
              ? 'No encontramos esto en tu cuenta. Escanea su código QR para abrirlo.'
              : errorMessage(card.error)}
          </Alert>
        ) : null}
        {card.data ? <CardGallery key={card.data.id} card={card.data} /> : null}
      </div>
    </dialog>
  );
}

/**
 * Cartas de la lectora (el nombre lo elige la autora; por defecto «Hallazgos»): SOLO lo que abrió con su QR, en una
 * cuadrícula de portadas con su título. De lo que no abrió no se muestra nada (ni cuántas hay, salvo que se encienda
 * `CARDS_SHOW_LOCKED`). Al tocar una se abre en grande.
 */
export function CardsPage() {
  const { cardId } = useParams();
  const label = useCardsLabel();
  usePageMeta({ title: label, noindex: true });
  const list = useQuery({ queryKey: cardKeys.list, queryFn: cardsApi.list });
  const cards = list.data?.cards ?? [];

  return (
    <>
      <PageHeader title={label} subtitle="Lo que has ido abriendo con tus códigos QR." />
      {list.isPending ? <Loading label="Cargando…" /> : null}
      {list.isError ? <Alert>{errorMessage(list.error)}</Alert> : null}
      {list.data?.testMode ? (
        <div className="mb-4">
          <Alert tone="primary" title="Modo prueba">
            Como administradora ves todo lo publicado, aunque no lo hayas abierto con su código.
          </Alert>
        </div>
      ) : null}
      {list.data && cards.length === 0 && !list.data.locked ? (
        <EmptyState title={`Todavía no has abierto nada en «${label}»`}>
          Escanea con la cámara de tu celular el código QR de tu libro y lo que encuentres quedará
          guardado aquí, en tu cuenta.{' '}
          <Link to="/panel" className="underline underline-offset-2">
            Ir a mis libros
          </Link>
        </EmptyState>
      ) : null}
      {list.data && (cards.length > 0 || list.data.locked) ? (
        <ul className="cards-grid" aria-label={label}>
          {cards.map((card) => (
            <CardTile key={card.id} card={card} />
          ))}
          {Array.from({ length: list.data.locked ?? 0 }, (_, index) => (
            <LockedTile key={`bloqueada-${index}`} />
          ))}
        </ul>
      ) : null}
      {cardId ? <CardDialog key={cardId} cardId={cardId} /> : null}
    </>
  );
}
