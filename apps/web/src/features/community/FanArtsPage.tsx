import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { Alert, EmptyState, Loading, PageHeader } from '../../shared/ui/layout';
import { Coverflow } from '../../shared/ui/Coverflow';
import { Lightbox } from '../posts/templates/Lightbox';
import { booksApi, readerKeys } from '../reader/api';
import { communityApi, communityKeys } from './api';
import { FanArtGallery } from './FanArtGallery';

/**
 * Fan arts: dibujos de lectores, cargados por la autora **con permiso del artista**. La galería se acomoda según
 * cuántos hay (una pieza destacada, hileras centradas o mosaico); desde 5 se puede cambiar al carrusel. Al tocar uno
 * se abre ampliado con el crédito del artista. Sin envío público: se escribe a la autora.
 */
export function FanArtsPage() {
  const [bookId, setBookId] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  // Galería por defecto; el carrusel es una vista alternativa que solo se ofrece desde 5 piezas.
  const [view, setView] = useState<'galeria' | 'carrusel'>('galeria');
  const books = useQuery({ queryKey: readerKeys.books, queryFn: booksApi.list, staleTime: 60_000 });
  const query = useQuery({
    queryKey: communityKeys.fanArts(bookId),
    queryFn: () => communityApi.fanArts(bookId),
    retry: false,
  });
  const published = (books.data?.books ?? []).filter((book) => book.status === 'published');
  const arts = query.data?.fanArts ?? [];
  const CAROUSEL_FROM = 5;
  const mode = view === 'carrusel' && arts.length >= CAROUSEL_FROM ? 'carrusel' : 'galeria';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Fan arts" subtitle="Dibujos de lectores del universo Memorias." />

      {published.length > 1 ? (
        <div role="group" aria-label="Filtrar por libro" className="flex flex-wrap gap-2">
          {[undefined, ...published].map((book) => (
            <button
              key={book?.id ?? 'todos'}
              type="button"
              aria-pressed={bookId === book?.id}
              onClick={() => setBookId(book?.id)}
              className="chip"
            >
              {book?.title ?? 'Todos'}
            </button>
          ))}
        </div>
      ) : null}

      {query.isPending ? <Loading /> : null}
      {query.isError ? <Alert>{errorMessage(query.error)}</Alert> : null}
      {query.isSuccess && arts.length === 0 ? (
        <EmptyState title="Todavía no hay fan arts publicados.">
          Cuando la autora publique los primeros, aparecerán aquí.
        </EmptyState>
      ) : null}
      {arts.length >= CAROUSEL_FROM ? (
        <div role="group" aria-label="Forma de verlos" className="flex flex-wrap gap-2">
          {(['galeria', 'carrusel'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setView(option)}
              className="chip"
            >
              {option === 'carrusel' ? 'Carrusel' : 'Galería'}
            </button>
          ))}
        </div>
      ) : null}

      {arts.length > 0 && mode === 'carrusel' ? (
        <Coverflow
          label="Fan arts"
          onOpen={setOpen}
          items={arts.map((art) => ({
            id: art.id,
            image: art.image,
            label: `Ampliar el fan art ${art.title ?? `de ${art.artistName}`}`,
            caption: (
              <>
                {art.title ? <p className="font-semibold">{art.title}</p> : null}
                <p className="text-sm text-muted">Por {art.artistName}</p>
              </>
            ),
          }))}
        />
      ) : null}

      {arts.length > 0 && mode === 'galeria' ? (
        <FanArtGallery arts={arts} onOpen={setOpen} />
      ) : null}

      <p className="text-sm text-muted">
        ¿Hiciste un dibujo? Escríbele a la autora desde{' '}
        <Link to="/contacto" className="underline">
          Contacto
        </Link>
        .
      </p>

      {open !== null ? (
        <Lightbox
          items={arts.map((art) => ({
            image: art.image,
            caption: (
              <>
                {art.title ? <p className="font-semibold">{art.title}</p> : null}
                <p className="text-sm">
                  Por{' '}
                  {art.artistLink ? (
                    <a
                      href={art.artistLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {art.artistName} ↗
                    </a>
                  ) : (
                    art.artistName
                  )}{' '}
                  · publicado con su permiso
                </p>
              </>
            ),
          }))}
          index={open}
          onChange={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
