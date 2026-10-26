import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { releaseTarget } from '../../shared/lib/countdown';
import { formatDate } from '../../shared/lib/dates';
import { Plate } from '../../shared/ui/Plate';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { Alert } from '../../shared/ui/layout';
import { Button } from '../../shared/ui/controls';
import { useSession } from '../auth/session';
import { NotFoundPage } from '../../app/NotFoundPage';
import { Countdown } from '../home/Countdown';
import { publicKeys } from '../home/api';
import { booksApi } from '../reader/api';
import { BookFacts, BookGenres } from './BookFacts';
import { hasPurchaseLinks, PurchaseList } from './PurchaseList';

/**
 * Página de un libro (`/libros/:slug`), versión mínima: portada, título, lema, sinopsis, fecha de salida y dónde
 * conseguirlo. La ficha completa del libro viene después; esta ruta ya existe para que la portada enlace a ella.
 */
export function BookPage() {
  const { slug = '' } = useParams();
  const book = useQuery({
    queryKey: publicKeys.book(slug),
    queryFn: () => booksApi.get(slug),
    retry: false,
  });
  const session = useSession();
  const title = book.data?.title;
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · Universo Memorias`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  if (book.isError) {
    const missing = book.error instanceof ApiClientError && book.error.status === 404;
    return missing ? (
      <NotFoundPage />
    ) : (
      <Alert tone="warning" title="No pudimos cargar el libro">
        Inténtalo de nuevo en un momento.
        <div className="mt-2">
          <Button variant="secondary" onClick={() => void book.refetch()}>
            Reintentar
          </Button>
        </div>
      </Alert>
    );
  }
  if (!book.data) {
    // Esqueleto con la forma y el alto de la página: al llegar el libro nada se mueve.
    return (
      <div
        role="status"
        aria-label="Cargando el libro"
        className="mx-auto flex max-w-5xl flex-col gap-8"
      >
        <div className="h-6 w-36 rounded-full bg-surface-alt/70 motion-safe:animate-pulse" />
        <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
          <div className="mx-auto aspect-[2/3] w-3/5 max-w-72 rounded-token-xs bg-surface-alt/70 motion-safe:animate-pulse md:w-full md:max-w-none" />
          <div className="flex flex-col gap-4">
            <div className="h-12 w-3/4 rounded-token-xs bg-surface-alt/70 motion-safe:animate-pulse" />
            <div className="h-5 w-full rounded-full bg-surface-alt/70 motion-safe:animate-pulse" />
            <div className="h-5 w-5/6 rounded-full bg-surface-alt/70 motion-safe:animate-pulse" />
          </div>
        </div>
      </div>
    );
  }
  const data = book.data;
  const releaseAt = releaseTarget(data.releaseDate);
  return (
    <article aria-labelledby="libro-pagina-title" className="mx-auto flex max-w-5xl flex-col gap-8">
      <Link to="/" className="link-slide inline-flex min-h-11 items-center self-start">
        Volver al inicio
      </Link>
      <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
        <Plate
          cover={data.cover}
          title={data.title}
          priority
          className="mx-auto w-3/5 max-w-72 md:w-full md:max-w-none"
          landscapeClassName="mx-auto w-full max-w-xl md:max-w-none"
          sizes="(min-width: 768px) 440px, 60vw"
        />
        <div className="flex flex-col gap-6">
          <div>
            <h1 id="libro-pagina-title" className="page-title">
              {data.title}
            </h1>
            {data.tagline ? (
              <p className="mt-3 font-read text-xl text-muted">{data.tagline}</p>
            ) : null}
          </div>
          <BookGenres genres={data.genres} />
          {data.synopsis ? <SafeHtml html={data.synopsis} /> : null}
          <BookFacts book={data} />
          {releaseAt && data.releaseDate ? (
            <Countdown target={releaseAt} dateLabel={formatDate(data.releaseDate)} />
          ) : null}
          {hasPurchaseLinks(data.purchaseLinks) ? (
            <section aria-labelledby="libro-comprar-title" className="flex flex-col gap-4">
              <h2 id="libro-comprar-title" className="section-title text-2xl">
                Dónde conseguirlo
              </h2>
              <PurchaseList links={data.purchaseLinks} />
            </section>
          ) : null}
          <div className="pt-2">
            {session.data ? (
              <Link to="/panel" className="btn btn-primary btn-lg">
                Continuar mi lectura
              </Link>
            ) : (
              <Link to="/registro" className="btn btn-primary btn-lg">
                Tengo el libro: crear mi cuenta
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
