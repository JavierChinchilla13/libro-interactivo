import type { ProgressResponse } from '@libro/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Alert, EmptyState, Loading, PageHeader } from '../../shared/ui/layout';
import { ThreadItem, ThreadList } from '../../shared/ui/ThreadList';
import { errorMessage } from '../../shared/api/messages';
import { useSession } from '../auth/session';
import { readerApi, readerKeys } from './api';
import { useSelectedBook } from './useBook';
import { LockIcon } from '../../shared/ui/icons';

type Experience = ProgressResponse['experiences'][number];

/** Texto cuando algo está bloqueado: nunca revela contenido, solo qué falta. */
export function lockedMessage(experience: Experience): string {
  if (experience.lockedBy?.reason === 'order') {
    return `Primero completa «${experience.lockedBy.waitingFor}».`;
  }
  return 'Sigue avanzando en tu lectura.';
}

const linkButton = 'btn';

/** Un paso del hilo: el punto está encendido si ya se abrió (disponible o completado) y apagado si sigue bloqueado. */
function ExperienceStep({ experience, primary }: { experience: Experience; primary: boolean }) {
  return (
    <ThreadItem state={experience.status === 'locked' ? 'unlit' : 'lit'}>
      <p className="label tabular-nums">Quiz {experience.order}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold">{experience.title}</h3>
        {experience.status === 'completed' ? (
          <span className="label !text-success">Completado</span>
        ) : null}
        {experience.status === 'available' ? (
          <span className="label !text-primary">Disponible</span>
        ) : null}
        {experience.status === 'locked' ? <span className="label">Bloqueado</span> : null}
      </div>

      {experience.status === 'locked' ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-muted">
          <LockIcon className="mt-0.5 size-4" />
          {lockedMessage(experience)}
        </p>
      ) : null}

      {experience.status === 'available' ? (
        <Link
          to={`/panel/quiz/${experience.id}`}
          className={`${linkButton} mt-3 ${primary ? 'btn-primary' : 'btn-secondary'}`}
        >
          {experience.inProgress ? 'Continuar' : 'Empezar'}
          <span className="sr-only"> {experience.title}</span>
        </Link>
      ) : null}

      {experience.status === 'completed' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link to={`/panel/resultados/${experience.id}`} className={`${linkButton} btn-secondary`}>
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
    </ThreadItem>
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
  // El único botón primario de la vista es el siguiente paso: el primer quiz disponible.
  const nextId = experiences.find((e) => e.status === 'available')?.id;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Hola, ${session.data?.name ?? ''}`}
        subtitle={book && books.length <= 1 ? book.title : undefined}
        actions={
          book && books.length > 1 ? (
            <label className="flex min-w-0 max-w-full items-center gap-2 text-sm text-muted">
              <span>Libro</span>
              <select
                value={book.id}
                onChange={(event) => select(event.target.value)}
                className="min-h-11 min-w-0 max-w-full rounded-token border border-border bg-surface px-2 text-text"
              >
                {books.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
            </label>
          ) : undefined
        }
      />

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
