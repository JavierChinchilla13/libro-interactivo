import type { ResultPayload, StagePayload } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/messages';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { Button } from '../../shared/ui/controls';
import { Alert, Loading } from '../../shared/ui/layout';
import { readerApi, readerKeys } from './api';
import { lockedMessage } from './DashboardPage';
import { ResultView } from './ResultView';
import { RevealSequence } from './RevealSequence';

type View =
  | { phase: 'intro' }
  | {
      phase: 'stage';
      attemptId: string;
      stage: StagePayload;
      answers: Record<string, string>;
      index: number;
    }
  | { phase: 'reveal'; result: ResultPayload }
  | { phase: 'result'; result: ResultPayload };

/** El título del documento acompaña cada fase (lo anuncian los lectores de pantalla al cambiar). */
function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/**
 * Titular que recibe el foco al aparecer: al cambiar de fase el foco no se pierde en `body` y el lector de pantalla
 * anuncia dónde está. `srOnly` lo deja solo para lectores cuando la fase ya tiene su propio titular visible.
 */
function PhaseHeading({
  children,
  className = '',
  srOnly = false,
}: {
  children: ReactNode;
  className?: string;
  srOnly?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1
      ref={ref}
      tabIndex={-1}
      className={`${srOnly ? 'sr-only' : ''} focus:outline-none ${className}`}
    >
      {children}
    </h1>
  );
}

/** Volver al panel desde el quiz: un botón de 44 px, con aviso si hay respuestas que se perderían. */
function LeaveButton({ unsaved }: { unsaved: boolean }) {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      className="self-start px-3"
      onClick={() => {
        if (
          !unsaved ||
          window.confirm(
            'Si sales ahora, las respuestas de esta pregunta no se guardan. ¿Volver al panel?',
          )
        ) {
          void navigate('/panel');
        }
      }}
    >
      ‹ Volver al panel
    </Button>
  );
}

/** Quiz de punta a punta: introducción → preguntas → secuencia de revelado → resultado. */
export function QuizPage() {
  const { quizId = '' } = useParams();
  const client = useQueryClient();
  const [view, setView] = useState<View>({ phase: 'intro' });

  const intro = useQuery({
    queryKey: readerKeys.intro(quizId),
    queryFn: () => readerApi.intro(quizId),
    retry: false,
    staleTime: 0,
  });
  const bookId = intro.data?.bookId ?? '';
  const progress = useQuery({
    queryKey: readerKeys.progress(bookId),
    queryFn: () => readerApi.progress(bookId),
    enabled: bookId !== '',
  });

  const quizTitle = intro.data?.title ?? 'Quiz';
  const titleByPhase =
    view.phase === 'stage'
      ? `Pregunta ${view.index + 1} de ${view.stage.questions.length} · ${quizTitle}`
      : view.phase === 'reveal'
        ? 'Preparando tu resultado'
        : view.phase === 'result'
          ? `Tu resultado · ${view.result.title}`
          : quizTitle;
  useDocumentTitle(`${titleByPhase} · Universo Memorias`);

  /** Lo que cambia al terminar un intento: el avance, los resultados y la introducción de este quiz. */
  const refreshAfterCompleting = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['reader', 'progress'] }),
      client.invalidateQueries({ queryKey: ['reader', 'results'] }),
      client.invalidateQueries({ queryKey: ['reader', 'quiz-results'] }),
      client.invalidateQueries({ queryKey: ['reader', 'extras'] }),
      client.invalidateQueries({ queryKey: readerKeys.intro(quizId) }),
    ]);
  }, [client, quizId]);

  const start = useMutation({
    mutationFn: () => readerApi.start(quizId),
    onSuccess: (response) => {
      if (response.status === 'in_progress') {
        setView({
          phase: 'stage',
          attemptId: response.attemptId,
          stage: response.stage,
          answers: {},
          index: 0,
        });
      }
    },
  });

  const submit = useMutation({
    mutationFn: (input: { attemptId: string; stageId: string; answers: Record<string, string> }) =>
      readerApi.submit(input.attemptId, input.stageId, input.answers),
    onSuccess: (response) => {
      if (response.status === 'in_progress') {
        setView({
          phase: 'stage',
          attemptId: response.attemptId,
          stage: response.stage,
          answers: {},
          index: 0,
        });
        return;
      }
      void refreshAfterCompleting();
      const lines = [
        ...(response.result.revealIntro?.lines ?? []),
        ...(response.result.reveal?.lines ?? []),
      ];
      setView({ phase: lines.length > 0 ? 'reveal' : 'result', result: response.result });
    },
  });

  const finishReveal = useCallback(() => {
    setView((current) =>
      current.phase === 'reveal' ? { phase: 'result', result: current.result } : current,
    );
  }, []);

  if (intro.isPending) return <Loading />;

  if (intro.isError) {
    const locked = intro.error instanceof ApiClientError && intro.error.code === 'NOT_UNLOCKED';
    return (
      <section className="mx-auto max-w-lg">
        <h1 className="mb-3 page-title">
          {locked ? 'Aún no puedes hacer este quiz' : 'No pudimos abrir el quiz'}
        </h1>
        <p className="mb-4 text-muted">
          {locked
            ? 'Todavía no está desbloqueado en tu cuenta. En tu panel verás qué falta.'
            : errorMessage(intro.error)}
        </p>
        <Link to="/panel" className="underline">
          Volver a mi panel
        </Link>
      </section>
    );
  }

  const quiz = intro.data;
  const experiences = progress.data?.experiences ?? [];
  const position = experiences.findIndex((e) => e.id === quizId);

  if (view.phase === 'intro') {
    const startError = start.error instanceof ApiClientError ? start.error : null;
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <LeaveButton unsaved={false} />
        <div className="quiz-hero">
          {quiz.image ? (
            <img
              src={thumbUrl(quiz.image.url, 1200)}
              alt={quiz.image.alt}
              className="quiz-hero-img"
            />
          ) : null}
          <div className="quiz-hero-content">
            {position >= 0 ? (
              <p className="label">
                Quiz {position + 1} de {experiences.length}
              </p>
            ) : null}
            <PhaseHeading className="page-title text-h2">{quiz.title}</PhaseHeading>
          </div>
        </div>
        {quiz.instructionsHtml ? <SafeHtml html={quiz.instructionsHtml} /> : null}
        <p className="text-sm text-muted">
          No hay respuestas correctas: elige la que más va contigo.
        </p>
        {!quiz.allowRetake ? (
          <Alert tone="warning" title="Este quiz se juega una sola vez">
            Tu resultado quedará guardado en tu cuenta.
          </Alert>
        ) : null}
        {quiz.status === 'completed' ? (
          <p className="text-sm">
            Ya lo completaste.{' '}
            <Link to={`/panel/resultados/${quiz.id}`} className="underline">
              Ver mi resultado
            </Link>
          </p>
        ) : null}
        {startError ? (
          <Alert>
            {startError.code === 'CONFLICT'
              ? 'Este quiz solo se puede jugar una vez.'
              : startError.code === 'NOT_UNLOCKED'
                ? 'Aún no puedes hacer este quiz.'
                : errorMessage(startError)}
          </Alert>
        ) : null}
        {quiz.canStart ? (
          <Button
            size="lg"
            className="self-start"
            loading={start.isPending}
            onClick={() => start.mutate()}
          >
            {quiz.inProgressAttemptId
              ? 'Continuar'
              : quiz.status === 'completed'
                ? 'Repetir'
                : 'Comenzar'}
          </Button>
        ) : null}
      </div>
    );
  }

  if (view.phase === 'stage') {
    const { stage, answers, index, attemptId } = view;
    const question = stage.questions[index];
    if (!question) return <Loading />;
    const last = index === stage.questions.length - 1;
    const chosen = answers[question.id];
    const patch = (next: Partial<Extract<View, { phase: 'stage' }>>) =>
      setView({ ...view, ...next });

    return (
      <div className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-xl flex-col gap-5">
        <div className="flex items-center justify-between text-sm">
          <LeaveButton unsaved={Object.keys(answers).length > 0} />
          <span aria-hidden="true">
            Pregunta {index + 1} de {stage.questions.length}
          </span>
        </div>
        {/* Cada pregunta anuncia su posición y recibe el foco: el lector de pantalla no se queda en la anterior. */}
        <PhaseHeading key={question.id} srOnly>
          {`${quiz.title}: pregunta ${index + 1} de ${stage.questions.length}`}
        </PhaseHeading>
        <div
          role="progressbar"
          aria-label="Avance del quiz"
          aria-valuemin={1}
          aria-valuemax={stage.questions.length}
          aria-valuenow={index + 1}
          aria-valuetext={`Pregunta ${index + 1} de ${stage.questions.length}`}
          className="flex gap-1.5"
        >
          {stage.questions.map((item, position) => (
            <span
              key={item.id}
              aria-hidden="true"
              className={`h-1.5 flex-1 rounded-full transition-colors duration-(--token-dur-fast) ease-token-out ${position <= index ? 'bg-primary' : 'bg-unlit/40'}`}
            />
          ))}
        </div>
        {stage.title && index === 0 ? <p className="text-xl font-semibold">{stage.title}</p> : null}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-4 text-2xl font-semibold leading-snug sm:text-3xl">
            {question.text}
          </legend>
          {question.image ? (
            <img
              src={thumbUrl(question.image.url, 800)}
              alt={question.image.alt}
              className="img-frame max-h-56 w-auto max-w-full self-start rounded-token-xs"
            />
          ) : null}
          {question.answers.map((answer) => (
            <label key={answer.id} className="option">
              <input
                type="radio"
                name={question.id}
                checked={chosen === answer.id}
                onChange={() => patch({ answers: { ...answers, [question.id]: answer.id } })}
              />
              {answer.text}
            </label>
          ))}
        </fieldset>
        {submit.isError ? <Alert>{errorMessage(submit.error)}</Alert> : null}
        {/* Las acciones quedan abajo, al alcance del pulgar, y ocupan el ancho. */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex gap-3 border-t border-line bg-bg px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <Button
            variant="secondary"
            size="lg"
            disabled={index === 0}
            onClick={() => patch({ index: index - 1 })}
          >
            ‹ Atrás
          </Button>
          {last ? (
            <Button
              size="lg"
              className="flex-1"
              disabled={chosen === undefined}
              loading={submit.isPending}
              onClick={() => submit.mutate({ attemptId, stageId: stage.stageId, answers })}
            >
              Terminar
            </Button>
          ) : (
            <Button
              size="lg"
              className="flex-1"
              disabled={chosen === undefined}
              onClick={() => patch({ index: index + 1 })}
            >
              Siguiente ›
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (view.phase === 'reveal') {
    const lines = [...(view.result.revealIntro?.lines ?? []), ...(view.result.reveal?.lines ?? [])];
    const effect = view.result.reveal?.effect ?? view.result.revealIntro?.effect;
    return (
      <>
        <PhaseHeading srOnly>Tus resultados se están preparando</PhaseHeading>
        <RevealSequence lines={lines} effect={effect} onDone={finishReveal} />
      </>
    );
  }

  // Resultado: el CTA principal es el siguiente paso real de la progresión.
  const next = position >= 0 ? experiences[position + 1] : undefined;
  const nextOpen = next?.status === 'available' ? next : undefined;
  const primary = nextOpen
    ? { to: `/panel/quiz/${nextOpen.id}`, label: `Siguiente: Quiz ${nextOpen.order}` }
    : !next && progress.data?.bookCompleted
      ? { to: '/panel/extras', label: 'Ver los extras' }
      : { to: '/panel', label: 'Volver a mi panel' };
  const secondaryPanel = primary.to !== '/panel';

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <ResultView result={view.result} asPage />
      <div className="flex flex-col gap-3">
        <Link to={primary.to} className="btn btn-primary btn-lg w-full sm:w-auto sm:self-start">
          {primary.label}
        </Link>
        {next && next.status === 'locked' ? (
          <p className="text-sm text-muted">Tu siguiente paso: {lockedMessage(next)}</p>
        ) : null}
        <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
          <Link
            to={`/panel/resultados/${quiz.id}`}
            className="inline-flex min-h-11 items-center rounded-lg px-2 underline underline-offset-4"
          >
            Mis resultados
          </Link>
          {secondaryPanel ? (
            <Link
              to="/panel"
              className="inline-flex min-h-11 items-center rounded-lg px-2 underline underline-offset-4"
            >
              Volver a mi panel
            </Link>
          ) : null}
          {quiz.allowRetake ? (
            <Button
              variant="ghost"
              className="px-2 text-sm underline underline-offset-4"
              onClick={() => {
                setView({ phase: 'intro' });
                void intro.refetch();
              }}
            >
              ¿Quieres jugar otra vez?
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
