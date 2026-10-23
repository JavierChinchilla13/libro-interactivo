import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { errorMessage } from '../../shared/api/messages';
import { releaseTarget } from '../../shared/lib/countdown';
import { formatDate } from '../../shared/lib/dates';
import { FieldEmblem } from '../../shared/ui/FieldEmblem';
import { LockIcon } from '../../shared/ui/icons';
import { Alert, EmptyState, Loading } from '../../shared/ui/layout';
import { Plate } from '../../shared/ui/Plate';
import { ThreadList } from '../../shared/ui/ThreadList';
import { Countdown } from '../home/Countdown';
import { readerApi, readerKeys } from './api';
import { ExperienceStep } from './ExperienceStep';
import { LOCKED_BOOK_TEXT, type LibraryEntry } from './LibraryBookCard';
import { nextHref } from './nextStep';
import { setSelectedBookId } from './useBook';
import { useLibrary } from './useLibrary';

const linkButton = 'btn';

/** Silueta de una tarjeta que aún no se abre: solo forma y el candado; nada del contenido. */
function Silhouette({ title, children }: { title: string; children: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-token-xl border border-dashed border-line p-5">
      <div aria-hidden="true" className="flex max-w-sm flex-col gap-2 opacity-70">
        <span className="silhouette-bar w-3/4" />
        <span className="silhouette-bar w-1/2" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="flex items-start gap-2 text-sm text-muted">
        <LockIcon className="mt-0.5 size-4" />
        {children}
      </p>
    </div>
  );
}

/** Cabecera del libro: portada, título, avance, siguiente paso y cuenta atrás si todavía no sale. */
function BookHeader({ entry }: { entry: LibraryEntry }) {
  const { book, access, progress } = entry;
  const releaseAt = releaseTarget(book.releaseDate);
  // La cuenta atrás se fija al montar: un libro cuya fecha ya pasó no la muestra.
  const [now] = useState(() => Date.now());
  const counting = releaseAt !== undefined && releaseAt.getTime() > now && access !== 'locked';
  const href = nextHref(entry);
  const next = progress?.nextExperience;
  return (
    <header className="flex flex-col gap-5">
      <Link to="/panel" className="self-start text-sm text-muted underline">
        ← Tus libros
      </Link>
      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10">
        <div className={access === 'open' ? '' : 'opacity-60 saturate-50'}>
          <Plate
            cover={book.cover}
            priority
            className="w-full"
            landscapeClassName="w-full"
            sizes="(min-width: 768px) 420px, 92vw"
            landscapeSizes="(min-width: 768px) 520px, 92vw"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <p className="label">
            {access === 'open' ? 'Tu libro' : access === 'locked' ? 'Sin abrir' : 'Próximamente'}
          </p>
          <h1 className="page-title [overflow-wrap:anywhere]">{book.title}</h1>
          {book.tagline ? (
            <p className="text-muted [overflow-wrap:anywhere]">{book.tagline}</p>
          ) : null}

          {progress ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium tabular-nums">
                Progreso: {progress.done} de {progress.total}
              </p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                aria-label="Avance en el libro"
                className="meter"
              >
                <div
                  className="meter-scale"
                  style={
                    { '--p': progress.total ? progress.done / progress.total : 0 } as CSSProperties
                  }
                />
              </div>
            </div>
          ) : null}

          {access === 'locked' ? (
            <p className="flex items-start gap-2 text-sm text-muted">
              <LockIcon className="mt-0.5 size-4" />
              {LOCKED_BOOK_TEXT}
            </p>
          ) : null}

          {counting && releaseAt && book.releaseDate ? (
            <Countdown
              target={releaseAt}
              dateLabel={formatDate(book.releaseDate)}
              animated={false}
              compact
            />
          ) : null}

          {next && href ? (
            <Link to={href} className={`${linkButton} btn-primary btn-lg self-start`}>
              Seguir con {next.title}
            </Link>
          ) : null}
          {access !== 'locked' ? (
            <Link to={`/libros/${book.slug}`} className="self-start text-sm text-muted underline">
              Ver la ficha del libro
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/**
 * Página de un libro dentro del panel (`/panel/libros/:slug`), distinta de la ficha pública `/libros/:slug`: cabecera
 * con portada y cuenta atrás, el hilo de experiencias, el juego, los resultados y los extras de ESE libro. Lo que
 * muestra cada parte lo decide el servidor: un libro sin abrir o «próximamente» solo enseña lo público. Al entrar deja
 * el libro como el activo del panel (fondo, resultados, extras y wiki).
 */
export function BookPanelPage() {
  const { slug = '' } = useParams();
  const library = useLibrary();
  const entry = library.data?.books.find((candidate) => candidate.book.slug === slug);
  const bookId = entry?.book.id ?? '';
  const isOpen = entry?.access === 'open';
  useEffect(() => {
    if (bookId && entry?.access !== 'upcoming') setSelectedBookId(bookId);
  }, [bookId, entry?.access]);
  const progress = useQuery({
    queryKey: readerKeys.progress(bookId),
    queryFn: () => readerApi.progress(bookId),
    enabled: isOpen,
    // Al volver de un quiz el avance debe estar al día.
    staleTime: 0,
  });
  const results = useQuery({
    queryKey: readerKeys.results(bookId),
    queryFn: () => readerApi.results(bookId),
    enabled: isOpen,
    staleTime: 0,
  });

  if (library.isPending) return <Loading />;
  if (library.error) return <Alert>{errorMessage(library.error)}</Alert>;
  if (!entry) return <NotFoundPage />;

  const experiences = progress.data?.experiences ?? [];
  const quizzes = experiences.filter((e) => e.kind === 'quiz');
  const game = experiences.find((e) => e.kind === 'game');
  const nothingOpen = experiences.length > 0 && experiences.every((e) => e.status === 'locked');
  const nextId = experiences.find((e) => e.status === 'available')?.id;
  const fieldOf = new Map(
    (results.data?.results ?? []).flatMap((r) => (r.visual ? [[r.quizId, r.visual] as const] : [])),
  );

  return (
    <div className="flex flex-col gap-10">
      <BookHeader entry={entry} />

      {isOpen ? (
        <>
          {progress.isPending ? <Loading /> : null}
          {progress.isError ? <Alert>{errorMessage(progress.error)}</Alert> : null}

          {progress.data ? (
            <>
              <section aria-labelledby="hilo" className="flex flex-col gap-4">
                <h2 id="hilo" className="section-title text-2xl">
                  Tu hilo
                </h2>
                {nothingOpen ? (
                  <Alert tone="warning" title="Aún no tienes experiencias abiertas">
                    Sigue leyendo y busca las pistas del libro: ahí empieza la aventura.
                  </Alert>
                ) : null}
                {experiences.length === 0 ? (
                  <EmptyState title="Este libro todavía no tiene quizzes publicados" />
                ) : (
                  <ThreadList label="Experiencias del libro">
                    {quizzes.map((experience) => (
                      <ExperienceStep
                        key={experience.id}
                        experience={experience}
                        primary={experience.id === nextId}
                        bookId={bookId}
                        field={fieldOf.get(experience.id)}
                      />
                    ))}
                    {game ? (
                      <ExperienceStep
                        key={game.id}
                        experience={game}
                        primary={game.id === nextId}
                        bookId={bookId}
                      />
                    ) : null}
                  </ThreadList>
                )}
              </section>

              <section aria-labelledby="resultados-libro" className="flex flex-col gap-4">
                <h2 id="resultados-libro" className="section-title text-2xl">
                  Tus resultados
                </h2>
                {results.data && results.data.results.length > 0 ? (
                  <ul
                    aria-label="Resultados de este libro"
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {results.data.results.map((result) => (
                      <li key={result.quizId}>
                        <Link
                          to={`/panel/resultados/${result.quizId}`}
                          className="flex h-full flex-col gap-2 rounded-token-xl border border-line bg-surface p-4 transition-colors hover:border-primary active:bg-surface-alt"
                        >
                          <span className="label">{result.title}</span>
                          <span className="font-semibold [overflow-wrap:anywhere]">
                            {result.resultTitle}
                          </span>
                          {result.visual ? <FieldEmblem visual={result.visual} /> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : results.isPending ? null : (
                  <p className="text-sm text-muted">
                    Cuando completes un quiz, tu resultado se queda aquí.
                  </p>
                )}
                <Link
                  to={`/panel/libros/${entry.book.slug}/resultados`}
                  className={`${linkButton} btn-secondary self-start`}
                >
                  Ver todos mis resultados
                </Link>
              </section>

              <section aria-labelledby="extras-libro" className="flex flex-col gap-4">
                <h2 id="extras-libro" className="section-title text-2xl">
                  Capítulos extra
                </h2>
                {progress.data.bookCompleted ? (
                  <>
                    <p className="text-sm">
                      ¡Completaste todo el libro! Ya puedes abrir los capítulos extra.
                    </p>
                    <Link
                      to={`/panel/libros/${entry.book.slug}/extras`}
                      className={`${linkButton} btn-secondary self-start`}
                    >
                      Ver los extras
                    </Link>
                  </>
                ) : (
                  <Silhouette title="Capítulos extra">
                    Se abren al completar todos los quizzes y el juego de este libro.
                  </Silhouette>
                )}
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
