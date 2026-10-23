import type { ReaderLibraryResponse } from '@libro/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatDate } from '../../shared/lib/dates';
import { releaseTarget } from '../../shared/lib/countdown';
import { LockIcon } from '../../shared/ui/icons';
import { Plate } from '../../shared/ui/Plate';
import { Countdown } from '../home/Countdown';

export type LibraryEntry = ReaderLibraryResponse['books'][number];

/** Texto de un libro que aún no se abrió: dice qué hacer, sin revelar nada del contenido. */
export const LOCKED_BOOK_TEXT = 'Escanea el QR del primer quiz para abrirlo';

function Progress({ done, total, title }: { done: number; total: number; title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium tabular-nums">
        {done} de {total} experiencias abiertas
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`Avance en ${title}`}
        className="meter"
      >
        <div className="meter-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

/**
 * Un libro en «Tus libros». Tres formas según lo que decide el servidor (`access`):
 * - `open`: portada, avance y entrada al libro.
 * - `locked`: portada atenuada con candado, título y la indicación del QR; sin enlaces y sin nada protegido.
 * - `upcoming`: portada atenuada y «Próximamente» o la cuenta atrás (sin lienzo de partículas) si hay fecha.
 * `featured` es la tarjeta grande (un solo libro, o el primero con algo por hacer); si no, la de la cuadrícula.
 */
export function LibraryBookCard({
  entry,
  featured = false,
  priority = false,
}: {
  entry: LibraryEntry;
  featured?: boolean;
  priority?: boolean;
}) {
  const { book, access } = entry;
  const dim = access !== 'open';
  const releaseAt = access === 'upcoming' ? releaseTarget(book.releaseDate) : undefined;
  const [now] = useState(() => Date.now());
  const counting = releaseAt !== undefined && releaseAt.getTime() > now;

  const cover = (
    <div className="relative">
      <div className={dim ? 'opacity-55 saturate-50' : ''}>
        <Plate
          cover={book.cover}
          priority={priority}
          className="w-full"
          landscapeClassName="w-full"
          sizes={featured ? '(min-width: 768px) 420px, 92vw' : '(min-width: 1024px) 320px, 46vw'}
          landscapeSizes={
            featured ? '(min-width: 768px) 520px, 92vw' : '(min-width: 1024px) 360px, 92vw'
          }
        />
      </div>
      {access === 'locked' ? (
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-text">
          <span className="grid size-14 place-items-center rounded-full border border-line bg-surface">
            <LockIcon className="size-7" />
          </span>
        </span>
      ) : null}
    </div>
  );

  return (
    <article
      aria-label={book.title}
      data-access={access}
      className={`flex h-full gap-5 rounded-token-xl border border-line bg-surface p-4 sm:p-5 ${
        featured
          ? 'flex-col md:grid md:grid-cols-[5fr_7fr] md:items-center md:gap-8 md:p-7'
          : 'flex-col'
      }`}
    >
      {cover}
      <div className="flex min-w-0 flex-col gap-3">
        <p className="label">
          {access === 'open' ? 'Tu libro' : access === 'locked' ? 'Sin abrir' : 'Próximamente'}
        </p>
        <h3
          className={`section-title [overflow-wrap:anywhere] ${featured ? 'text-3xl md:text-4xl' : 'text-xl'}`}
        >
          {book.title}
        </h3>
        {book.tagline ? (
          <p className={`text-muted [overflow-wrap:anywhere] ${featured ? '' : 'text-sm'}`}>
            {book.tagline}
          </p>
        ) : null}

        {access === 'open' && entry.progress ? (
          <>
            <Progress done={entry.progress.done} total={entry.progress.total} title={book.title} />
            <Link to={`/panel/libros/${book.slug}`} className="btn btn-secondary mt-1 self-start">
              {entry.progress.bookCompleted ? 'Volver al libro' : 'Entrar al libro'}
              <span className="sr-only"> {book.title}</span>
            </Link>
          </>
        ) : null}

        {access === 'locked' ? (
          <p className="flex items-start gap-2 text-sm text-muted">
            <LockIcon className="mt-0.5 size-4" />
            {LOCKED_BOOK_TEXT}
          </p>
        ) : null}

        {access === 'upcoming' ? (
          counting && releaseAt && book.releaseDate ? (
            <Countdown
              target={releaseAt}
              dateLabel={formatDate(book.releaseDate)}
              animated={false}
            />
          ) : null
        ) : null}
      </div>
    </article>
  );
}
