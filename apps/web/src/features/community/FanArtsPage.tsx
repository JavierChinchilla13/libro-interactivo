import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../shared/api/messages';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { Alert, EmptyState, Loading } from '../../shared/ui/layout';
import { Lightbox } from '../posts/templates/Lightbox';
import { booksApi, readerKeys } from '../reader/api';
import { communityApi, communityKeys } from './api';

/**
 * Fan arts: mosaico de dibujos de lectores, cargados por la autora **con permiso del
 * artista**. Al tocar uno se abre ampliado con el crédito del artista. Sin envío público: se escribe a la autora.
 */
export function FanArtsPage() {
  const [bookId, setBookId] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState<number | null>(null);
  const books = useQuery({ queryKey: readerKeys.books, queryFn: booksApi.list, staleTime: 60_000 });
  const query = useQuery({
    queryKey: communityKeys.fanArts(bookId),
    queryFn: () => communityApi.fanArts(bookId),
    retry: false,
  });
  const published = (books.data?.books ?? []).filter((book) => book.status === 'published');
  const arts = query.data?.fanArts ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Fan arts</h1>
        <p className="text-muted">Dibujos de lectores del universo Memorias.</p>
      </div>

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
        <EmptyState title="Todavía no hay fan arts publicados." />
      ) : null}
      {arts.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {arts.map((art, index) => (
            <li key={art.id}>
              <button
                type="button"
                onClick={() => setOpen(index)}
                aria-label={`Ampliar el fan art ${art.title ?? `de ${art.artistName}`}`}
                className="block w-full overflow-hidden rounded-token-lg border border-border"
              >
                <img
                  src={thumbUrl(art.image.url, 480)}
                  alt={art.image.alt}
                  width={art.image.width}
                  height={art.image.height}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
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
