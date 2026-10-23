import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { errorMessage } from '../../shared/api/messages';
import { Alert, EmptyState, Loading, PageHeader } from '../../shared/ui/layout';
import { ThreadList } from '../../shared/ui/ThreadList';
import { booksApi, readerApi, readerKeys } from './api';
import { setSelectedBookId } from './bookSelection';
import { ExperienceStep } from './ExperienceStep';
import { playable } from './useBook';

const linkButton = 'btn';

/**
 * Página de un libro dentro del panel (`/panel/libros/:slug`): el hilo de experiencias, los capítulos extra y los
 * resultados de ESE libro. Distinta de la ficha pública `/libros/:slug`. Al entrar deja el libro como el activo del
 * panel (fondo, resultados, extras y wiki). El servidor decide qué está abierto: aquí solo se muestra.
 */
export function BookPanelPage() {
  const { slug = '' } = useParams();
  const books = useQuery({ queryKey: readerKeys.books, queryFn: booksApi.list, staleTime: 60_000 });
  const book = playable(books.data?.books ?? []).find((candidate) => candidate.slug === slug);
  const bookId = book?.id ?? '';
  useEffect(() => {
    if (bookId) setSelectedBookId(bookId);
  }, [bookId]);
  const progress = useQuery({
    queryKey: readerKeys.progress(bookId),
    queryFn: () => readerApi.progress(bookId),
    enabled: bookId !== '',
    // Al volver de un quiz el avance debe estar al día.
    staleTime: 0,
  });

  if (books.isPending) return <Loading />;
  if (books.error) return <Alert>{errorMessage(books.error)}</Alert>;
  if (!book) return <NotFoundPage />;

  const experiences = progress.data?.experiences ?? [];
  const done = experiences.filter((e) => e.status === 'completed').length;
  const nothingOpen = experiences.length > 0 && experiences.every((e) => e.status === 'locked');
  // El único botón primario de la vista es el siguiente paso: el primer quiz disponible.
  const nextId = experiences.find((e) => e.status === 'available')?.id;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={book.title}
        subtitle={book.tagline}
        actions={
          <Link to="/panel" className={`${linkButton} btn-secondary`}>
            Tus libros
          </Link>
        }
      />

      {progress.isPending ? <Loading /> : null}
      {progress.isError ? <Alert>{errorMessage(progress.error)}</Alert> : null}

      {progress.data ? (
        <>
          <section aria-label="Avance" className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              Progreso: {done} de {experiences.length}
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={experiences.length}
              aria-valuenow={done}
              aria-label="Avance en el libro"
              className="meter"
            >
              <div
                className="meter-fill"
                style={{ width: `${experiences.length ? (done / experiences.length) * 100 : 0}%` }}
              />
            </div>
          </section>

          {nothingOpen ? (
            <Alert tone="warning" title="Aún no tienes experiencias abiertas">
              Sigue leyendo y busca las pistas del libro: ahí empieza la aventura.
            </Alert>
          ) : null}

          {experiences.length === 0 ? (
            <EmptyState title="Este libro todavía no tiene quizzes publicados" />
          ) : (
            <ThreadList label="Experiencias del libro">
              {experiences.map((experience) => (
                <ExperienceStep
                  key={experience.id}
                  experience={experience}
                  primary={experience.id === nextId}
                  bookId={bookId}
                />
              ))}
            </ThreadList>
          )}

          <section className="flex flex-col gap-2 border-t border-line pt-6">
            <h2 className="text-lg font-semibold">Capítulos extra</h2>
            {progress.data.bookCompleted ? (
              <>
                <p className="text-sm">
                  ¡Completaste todo el libro! Ya puedes abrir los capítulos extra.
                </p>
                <Link to="/panel/extras" className={`${linkButton} self-start btn-secondary`}>
                  Ver los extras
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Se desbloquean al completar todos los quizzes y el juego de este libro.
                </p>
                <span>
                  <span className="label">Bloqueados</span>
                </span>
              </>
            )}
          </section>

          <section className="flex flex-col gap-2 border-t border-line pt-6">
            <h2 className="text-lg font-semibold">Mis resultados</h2>
            <p className="text-sm text-muted">Todo lo que has descubierto.</p>
            <Link to="/panel/resultados" className={`${linkButton} btn-secondary self-start`}>
              Ver mis resultados
            </Link>
          </section>
        </>
      ) : null}
    </div>
  );
}
