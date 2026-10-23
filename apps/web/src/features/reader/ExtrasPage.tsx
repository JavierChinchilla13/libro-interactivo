import type { ExtraKind } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { ApiClientError } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/messages';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { Button } from '../../shared/ui/controls';
import { Alert, Badge, Card, EmptyState, Loading, PageHeader } from '../../shared/ui/layout';
import { readerApi, readerKeys } from './api';
import { useSelectedBook } from './useBook';

const KIND: Record<ExtraKind, string> = { pdf: 'PDF', text: 'Texto', image: 'Imagen' };

/** Capítulos extra: bloqueados hasta completar el libro, sin dar títulos ni cantidad. */
export function ExtrasPage() {
  const { slug } = useParams();
  const { book, isPending, error } = useSelectedBook(slug);
  const bookId = book?.id ?? '';
  const extras = useQuery({
    queryKey: readerKeys.extras(bookId),
    queryFn: () => readerApi.extras(bookId),
    enabled: bookId !== '',
    staleTime: 0,
  });
  const progress = useQuery({
    queryKey: readerKeys.progress(bookId),
    queryFn: () => readerApi.progress(bookId),
    enabled: bookId !== '',
  });

  if (isPending || (bookId !== '' && extras.isPending)) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  if (slug !== undefined && !book) return <NotFoundPage />;
  if (extras.isError) return <Alert>{errorMessage(extras.error)}</Alert>;

  const experiences = progress.data?.experiences ?? [];
  const done = experiences.filter((e) => e.status === 'completed').length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Capítulos extra" subtitle={slug !== undefined ? book?.title : undefined} />
      {extras.data?.locked !== false ? (
        <section className="flex flex-col gap-3 border-l-2 border-unlit pl-5">
          <h2 className="font-semibold">Aún están bloqueados</h2>
          <p className="text-sm text-muted">
            Completa todos los quizzes y el juego de este libro para abrirlos.
          </p>
          {experiences.length > 0 ? (
            <p className="text-sm font-medium">
              {done} de {experiences.length}
            </p>
          ) : null}
          <Link to="/panel" className="text-sm underline">
            Ir a mi panel
          </Link>
        </section>
      ) : extras.data.extras.length === 0 ? (
        <EmptyState title="Por ahora no hay capítulos extra">
          La autora los irá agregando.
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted">{book?.title} · ¡Completaste todo!</p>
          <ul className="divide-y divide-line border-y border-line">
            {extras.data.extras.map((extra) => (
              <li key={extra.id}>
                <article className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <h2 className="font-semibold">{extra.title}</h2>
                    <p className="text-xs text-muted">{KIND[extra.kind]}</p>
                    {extra.description ? <p className="mt-1 text-sm">{extra.description}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {extra.opened ? <Badge tone="success">Visto</Badge> : null}
                    <Link to={`/panel/extras/${extra.id}`} className="btn btn-secondary">
                      Abrir<span className="sr-only"> {extra.title}</span>
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Lector de un extra: texto en pantalla o archivo privado con enlace que caduca a los pocos minutos. */
export function ExtraViewPage() {
  const { extraId = '' } = useParams();
  const extra = useQuery({
    queryKey: ['reader', 'extra', extraId],
    queryFn: () => readerApi.extra(extraId),
    retry: false,
    // Cada apertura pide un enlace nuevo (y queda registrada como «vista»); nunca se reutiliza uno viejo.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const [expired, setExpired] = useState(false);
  const expiresIn = extra.data && extra.data.kind !== 'text' ? extra.data.expiresIn : undefined;

  useEffect(() => {
    if (expiresIn === undefined) return undefined;
    const timer = setTimeout(() => setExpired(true), Math.max(1, expiresIn - 10) * 1000);
    return () => clearTimeout(timer);
  }, [expiresIn, extra.dataUpdatedAt]);

  if (extra.isPending) return <Loading />;
  if (extra.isError) {
    const locked = extra.error instanceof ApiClientError && extra.error.code === 'NOT_UNLOCKED';
    return (
      <Card className="mx-auto max-w-lg">
        <h1 className="mb-3 page-title">{locked ? 'Aún está bloqueado' : 'No pudimos abrirlo'}</h1>
        <p className="mb-4 text-muted">
          {locked
            ? 'Completa todos los quizzes y el juego de este libro para abrir los capítulos extra.'
            : errorMessage(extra.error)}
        </p>
        <Link to="/panel/extras" className="underline">
          Volver a los extras
        </Link>
      </Card>
    );
  }

  const data = extra.data;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <p className="text-sm">
        <Link to="/panel/extras" className="underline">
          ✕ Cerrar
        </Link>
      </p>
      <h1 className="page-title">{data.title}</h1>

      {data.kind === 'text' ? <SafeHtml html={data.bodyHtml} /> : null}

      {data.kind !== 'text' && expired ? (
        <Alert tone="warning" title="El enlace del documento caducó">
          <p className="mt-1">Vuelve a abrirlo.</p>
          <Button
            className="mt-2"
            onClick={() => {
              setExpired(false);
              void extra.refetch();
            }}
          >
            Reintentar
          </Button>
        </Alert>
      ) : null}

      {data.kind === 'image' && !expired ? (
        <img
          src={data.url}
          alt={data.title}
          className="max-h-[80dvh] w-auto max-w-full self-start rounded-token"
        />
      ) : null}

      {data.kind === 'pdf' && !expired ? (
        <>
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary self-start"
          >
            Abrir en otra pestaña
          </a>
          <iframe
            title={data.title}
            src={data.url}
            className="hidden h-[75dvh] w-full rounded-token border border-border sm:block"
          />
        </>
      ) : null}
    </div>
  );
}
