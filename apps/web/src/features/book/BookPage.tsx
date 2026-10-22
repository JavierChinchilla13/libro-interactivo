import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { releaseTarget } from '../../shared/lib/countdown';
import { formatDate } from '../../shared/lib/dates';
import { Plate } from '../../shared/ui/Plate';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { Alert } from '../../shared/ui/layout';
import { NotFoundPage } from '../../app/NotFoundPage';
import { Countdown } from '../home/Countdown';
import { publicKeys } from '../home/api';
import { booksApi } from '../reader/api';
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
      </Alert>
    );
  }
  if (!book.data) {
    return <p role="status">Cargando el libro…</p>;
  }
  const data = book.data;
  const releaseAt = releaseTarget(data.releaseDate);
  return (
    <article aria-labelledby="libro-pagina-title" className="mx-auto flex max-w-5xl flex-col gap-8">
      <Link to="/" className="link-slide self-start">
        Volver al inicio
      </Link>
      <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
        <Plate
          cover={data.cover}
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
          {data.synopsis ? <SafeHtml html={data.synopsis} /> : null}
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
        </div>
      </div>
    </article>
  );
}
