import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { NotFoundPage } from '../../app/NotFoundPage';
import { errorMessage } from '../../shared/api/messages';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { FieldEmblem } from '../../shared/ui/FieldEmblem';
import { Alert, Card, EmptyState, Loading, PageHeader } from '../../shared/ui/layout';
import { readerApi, readerKeys } from './api';
import { useLibrary } from './useLibrary';
import { ResultView } from './ResultView';
import { useSelectedBook } from './useBook';

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Mis resultados: el resultado vigente de cada quiz completado, sin repetirlos. */
export function ResultsPage() {
  const { slug } = useParams();
  const { book, isPending, error } = useSelectedBook(slug);
  const bookId = book?.id ?? '';
  const results = useQuery({
    queryKey: readerKeys.results(bookId),
    queryFn: () => readerApi.results(bookId),
    enabled: bookId !== '',
    staleTime: 0,
  });
  // Si algún quiz del libro se puede repetir, la descripción lo menciona (los datos ya están en caché del resumen).
  const progress = useQuery({
    queryKey: readerKeys.progress(bookId),
    queryFn: () => readerApi.progress(bookId),
    enabled: bookId !== '',
  });
  const canRetake = (progress.data?.experiences ?? []).some(
    (item) => item.kind === 'quiz' && item.allowRetake,
  );

  if (isPending || (bookId !== '' && results.isPending)) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;
  if (slug !== undefined && !book) return <NotFoundPage />;
  if (results.isError) return <Alert>{errorMessage(results.error)}</Alert>;

  const list = results.data?.results ?? [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tus resultados"
        subtitle={`Aquí queda lo que descubriste en este libro: tu resultado de cada quiz. ${
          canRetake
            ? 'Puedes revisar el historial de intentos y repetir los quizzes que lo permiten.'
            : 'Puedes revisar el historial de cada intento.'
        }`}
      />
      {list.length === 0 ? (
        <EmptyState title="Todavía no tienes resultados en este libro">
          Cuando completes un quiz, aquí queda lo que descubriste.{' '}
          <Link to={slug !== undefined ? `/panel/libros/${slug}` : '/panel'} className="underline">
            {slug !== undefined ? 'Ir al resumen del libro' : 'Ir a mi panel'}
          </Link>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {list.map((item) => (
            <li key={item.quizId}>
              <article className="flex items-center gap-4 py-4">
                {item.media?.kind === 'image' ? (
                  <img
                    src={thumbUrl(item.media.image.url, 160)}
                    alt=""
                    className="size-16 shrink-0 rounded-token object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted">
                    Quiz {item.order} · {item.title}
                  </p>
                  <h2 className="font-semibold">{item.resultTitle}</h2>
                  <p className="text-xs text-muted">
                    {date(item.completedAt)}
                    {item.attemptsCompleted > 1 ? ` · ${item.attemptsCompleted} intentos` : ''}
                  </p>
                  {item.visual ? <FieldEmblem visual={item.visual} className="mt-2" /> : null}
                </div>
                <Link to={`/panel/resultados/${item.quizId}`} className="underline">
                  Ver<span className="sr-only"> {item.resultTitle}</span>
                </Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Detalle de un resultado: el vigente completo y el historial de intentos (cada uno con la versión que respondió). */
export function ResultDetailPage() {
  const { quizId = '' } = useParams();
  const detail = useQuery({
    queryKey: readerKeys.quizResults(quizId),
    queryFn: () => readerApi.quizResults(quizId),
    retry: false,
    staleTime: 0,
  });
  const library = useLibrary();

  if (detail.isPending) return <Loading />;
  if (detail.isError) {
    return (
      <Card className="mx-auto max-w-lg">
        <h1 className="mb-3 page-title">Todavía no tienes este resultado</h1>
        <p className="mb-4 text-muted">Completa el quiz para verlo aquí.</p>
        <Link to="/panel" className="underline">
          Volver a mi panel
        </Link>
      </Card>
    );
  }

  const { title, current, history, allowRetake, bookId } = detail.data;
  // Vuelve a los resultados de ESE libro (con el punto de acceso general como respaldo mientras se sabe cuál es).
  const slug = library.data?.books.find((entry) => entry.book.id === bookId)?.book.slug;
  const back = slug ? `/panel/libros/${slug}/resultados` : '/panel/resultados';
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <p className="text-sm">
        <Link to={back} className="underline">
          ← Tus resultados
        </Link>
      </p>
      <p className="text-sm text-muted">{title}</p>
      <ResultView result={current.result} />

      {history.length > 1 ? (
        <section aria-label="Historial" className="flex flex-col gap-2">
          <h2 className="font-semibold">Historial</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {history.map((entry, index) => (
              <li key={entry.attemptId}>
                Intento {entry.attemptNumber} · {date(entry.completedAt)} · {entry.resultTitle}
                {index === 0 ? ' (vigente)' : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Link to={slug ? `/panel/libros/${slug}` : '/panel'} className="btn btn-primary">
          {slug ? 'Volver al libro' : 'Volver a mi panel'}
        </Link>
        {allowRetake ? (
          <Link to={`/panel/quiz/${quizId}`} className="text-sm underline">
            Repetir el quiz
          </Link>
        ) : (
          <span className="text-xs text-muted">Este quiz solo se juega una vez.</span>
        )}
      </div>
    </div>
  );
}
