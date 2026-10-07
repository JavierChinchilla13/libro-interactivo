import type { ProgressResponse } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Alert, Badge, Card, EmptyState, Loading } from '../../shared/ui/layout';
import { errorMessage } from '../../shared/api/messages';
import { useSession } from '../auth/session';
import { readerApi, readerKeys } from './api';
import { useSelectedBook } from './useBook';

type Experience = ProgressResponse['experiences'][number];

/** Texto cuando algo está bloqueado: nunca revela contenido, solo qué falta. */
export function lockedMessage(experience: Experience): string {
  if (experience.lockedBy?.reason === 'order') {
    return `Primero completa «${experience.lockedBy.waitingFor}».`;
  }
  return 'Sigue avanzando en tu lectura.';
}

const linkButton =
  'inline-flex min-h-11 items-center justify-center rounded-token px-4 text-sm font-semibold';

function ExperienceCard({ experience }: { experience: Experience }) {
  return (
    <Card as="article" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Quiz {experience.order}</p>
          <h3 className="font-semibold">{experience.title}</h3>
        </div>
        {experience.status === 'completed' ? <Badge tone="success">Completado</Badge> : null}
        {experience.status === 'available' ? <Badge tone="warning">Disponible</Badge> : null}
        {experience.status === 'locked' ? <Badge>Bloqueado</Badge> : null}
      </div>

      {experience.status === 'locked' ? (
        <p className="text-sm text-muted">🔒 {lockedMessage(experience)}</p>
      ) : null}

      {experience.status === 'available' ? (
        <Link
          to={`/panel/quiz/${experience.id}`}
          className={`${linkButton} self-start bg-primary text-primary-contrast`}
        >
          {experience.inProgress ? 'Continuar' : 'Empezar'}
          <span className="sr-only"> {experience.title}</span>
        </Link>
      ) : null}

      {experience.status === 'completed' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/panel/resultados/${experience.id}`}
            className={`${linkButton} border border-border`}
          >
            Ver mi resultado<span className="sr-only"> de {experience.title}</span>
          </Link>
          {experience.allowRetake ? (
            <Link
              to={`/panel/quiz/${experience.id}`}
              className={`${linkButton} text-muted underline`}
            >
              Repetir<span className="sr-only"> {experience.title}</span>
            </Link>
          ) : (
            <span className="text-xs text-muted">Solo se juega una vez</span>
          )}
        </div>
      ) : null}
    </Card>
  );
}

/** Panel del lector: cómo va en el libro y qué puede hacer ahora. */
export function DashboardPage() {
  const session = useSession();
  const { books, book, select, isPending, error } = useSelectedBook();
  const bookId = book?.id ?? '';
  const progress = useQuery({
    queryKey: readerKeys.progress(bookId),
    queryFn: () => readerApi.progress(bookId),
    enabled: bookId !== '',
    // Al volver de un quiz el avance debe estar al día.
    staleTime: 0,
  });

  if (isPending) return <Loading />;
  if (error) return <Alert>{errorMessage(error)}</Alert>;

  const experiences = progress.data?.experiences ?? [];
  const done = experiences.filter((e) => e.status === 'completed').length;
  const nothingOpen = experiences.length > 0 && experiences.every((e) => e.status === 'locked');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Hola, {session.data?.name}</h1>
        {book ? (
          <p className="text-muted">
            {books.length > 1 ? (
              <label className="flex items-center gap-2">
                <span>Libro</span>
                <select
                  value={book.id}
                  onChange={(event) => select(event.target.value)}
                  className="min-h-11 rounded-token border border-border bg-surface px-2"
                >
                  {books.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              book.title
            )}
          </p>
        ) : null}
      </div>

      {!book ? (
        <EmptyState title="Todavía no hay libros disponibles">Vuelve pronto.</EmptyState>
      ) : null}

      {progress.isPending && book ? <Loading /> : null}
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
              className="h-2 overflow-hidden rounded-full bg-surface-alt"
            >
              <div
                className="h-full bg-primary"
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
            <ul className="grid gap-4 sm:grid-cols-2" aria-label="Experiencias del libro">
              {experiences.map((experience) => (
                <li key={experience.id}>
                  <ExperienceCard experience={experience} />
                </li>
              ))}
            </ul>
          )}

          <Card className="flex flex-col gap-2">
            <h2 className="font-semibold">Capítulos extra</h2>
            {progress.data.bookCompleted ? (
              <>
                <p className="text-sm">
                  ¡Completaste todo el libro! Ya puedes abrir los capítulos extra.
                </p>
                <Link
                  to="/panel/extras"
                  className={`${linkButton} self-start bg-primary text-primary-contrast`}
                >
                  Ver los extras
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Se desbloquean al completar todos los quizzes y el juego de este libro.
                </p>
                <Badge>Bloqueados</Badge>
              </>
            )}
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="font-semibold">Mis resultados</h2>
            <p className="text-sm text-muted">Todo lo que has descubierto.</p>
            <Link
              to="/panel/resultados"
              className={`${linkButton} self-start border border-border`}
            >
              Ver mis resultados
            </Link>
          </Card>
        </>
      ) : null}
    </div>
  );
}
