import type { FieldVisualKey, ProgressResponse } from '@libro/shared';
import { Link } from 'react-router';
import { ThreadItem } from '../../shared/ui/ThreadList';
import { FieldEmblem } from '../../shared/ui/FieldEmblem';
import { LockIcon } from '../../shared/ui/icons';

type Experience = ProgressResponse['experiences'][number];
type FieldVisual = { key: FieldVisualKey; fieldName: string };

/** Texto cuando algo está bloqueado: nunca revela contenido, solo qué falta. */
export function lockedMessage(experience: Experience): string {
  if (experience.lockedBy?.reason === 'order') {
    return `Primero completa «${experience.lockedBy.waitingFor}».`;
  }
  return 'Sigue avanzando en tu lectura.';
}

const linkButton = 'btn';

/** Un paso del hilo: el punto está encendido si ya se abrió (disponible o completado) y apagado si sigue bloqueado. */
export function ExperienceStep({
  experience,
  primary,
  bookId,
  field,
}: {
  experience: Experience;
  primary: boolean;
  bookId: string;
  /** «Tu campo» del resultado de este quiz, si lo tiene (solo tras completarlo). */
  field?: FieldVisual | undefined;
}) {
  const isGame = experience.kind === 'game';
  const playTo = isGame ? `/panel/juego/${bookId}` : `/panel/quiz/${experience.id}`;
  return (
    <ThreadItem state={experience.status === 'locked' ? 'unlit' : 'lit'}>
      <p className="label tabular-nums">{isGame ? 'Juego' : `Quiz ${experience.order}`}</p>
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
        <>
          {/* Silueta de lo que sigue: solo la forma; el contenido no existe en el navegador. */}
          <div aria-hidden="true" className="mt-3 flex max-w-sm flex-col gap-2 opacity-70">
            <span className="silhouette-bar w-4/5" />
            <span className="silhouette-bar w-3/5" />
          </div>
          <p className="mt-3 flex items-start gap-2 text-sm text-muted">
            <LockIcon className="mt-0.5 size-4" />
            {lockedMessage(experience)}
          </p>
        </>
      ) : null}

      {experience.status === 'completed' && field ? (
        <FieldEmblem visual={field} className="mt-3" />
      ) : null}

      {experience.status === 'available' ? (
        <Link
          to={playTo}
          className={`${linkButton} mt-3 ${primary ? 'btn-primary' : 'btn-secondary'}`}
        >
          {experience.inProgress ? 'Continuar' : isGame ? 'Jugar' : 'Empezar'}
          <span className="sr-only"> {experience.title}</span>
        </Link>
      ) : null}

      {experience.status === 'completed' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isGame ? null : (
            <Link
              to={`/panel/resultados/${experience.id}`}
              className={`${linkButton} btn-secondary`}
            >
              Ver mi resultado<span className="sr-only"> de {experience.title}</span>
            </Link>
          )}
          {experience.allowRetake ? (
            <Link to={playTo} className={`${linkButton} text-muted underline`}>
              {isGame ? 'Jugar de nuevo' : 'Repetir'}
              <span className="sr-only"> {experience.title}</span>
            </Link>
          ) : (
            <span className="text-xs text-muted">Solo se juega una vez</span>
          )}
        </div>
      ) : null}
    </ThreadItem>
  );
}
