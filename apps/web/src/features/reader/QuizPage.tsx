import type { ResultPayload, StagePayload } from '@libro/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/messages';
import { thumbUrl } from '../../shared/lib/cloudinary';
import { SafeHtml } from '../../shared/ui/SafeHtml';
import { Button } from '../../shared/ui/controls';
import { Alert, Card, Loading } from '../../shared/ui/layout';
import { readerApi, readerKeys } from './api';
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
      <Card className="mx-auto max-w-lg">
        <h1 className="mb-3 font-display text-2xl font-bold">
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
      </Card>
    );
  }

  const quiz = intro.data;
  const experiences = progress.data?.experiences ?? [];
  const position = experiences.findIndex((e) => e.id === quizId);

  if (view.phase === 'intro') {
    const startError = start.error instanceof ApiClientError ? start.error : null;
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <p className="text-sm">
          <Link to="/panel" className="underline">
            ← Salir
          </Link>
        </p>
        {quiz.image ? (
          <img
            src={thumbUrl(quiz.image.url, 900)}
            alt={quiz.image.alt}
            className="max-h-64 w-auto max-w-full self-start rounded-token-lg border border-border"
          />
        ) : null}
        <div>
          {position >= 0 ? (
            <p className="text-sm text-muted">
              Quiz {position + 1} de {experiences.length}
            </p>
          ) : null}
          <h1 className="font-display text-3xl font-bold">{quiz.title}</h1>
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
          <Button className="self-start" loading={start.isPending} onClick={() => start.mutate()}>
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
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <div className="flex items-center justify-between text-sm">
          <Link to="/panel" className="underline">
            Salir
          </Link>
          <span>
            Pregunta {index + 1} de {stage.questions.length}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Avance del quiz"
          aria-valuemin={1}
          aria-valuemax={stage.questions.length}
          aria-valuenow={index + 1}
          className="h-2 overflow-hidden rounded-full bg-surface-alt"
        >
          <div
            className="h-full bg-primary"
            style={{ width: `${((index + 1) / stage.questions.length) * 100}%` }}
          />
        </div>
        {stage.title && index === 0 ? (
          <p className="font-display text-xl font-semibold">{stage.title}</p>
        ) : null}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-lg font-semibold">{question.text}</legend>
          {question.image ? (
            <img
              src={thumbUrl(question.image.url, 800)}
              alt={question.image.alt}
              className="max-h-56 w-auto max-w-full self-start rounded-token"
            />
          ) : null}
          {question.answers.map((answer) => (
            <label
              key={answer.id}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-token border px-4 py-3 ${
                chosen === answer.id ? 'border-primary bg-surface-alt' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name={question.id}
                checked={chosen === answer.id}
                onChange={() => patch({ answers: { ...answers, [question.id]: answer.id } })}
                className="size-5 accent-[var(--token-primary)]"
              />
              {answer.text}
            </label>
          ))}
        </fieldset>
        {submit.isError ? <Alert>{errorMessage(submit.error)}</Alert> : null}
        <div className="flex justify-between gap-3">
          <Button
            variant="secondary"
            disabled={index === 0}
            onClick={() => patch({ index: index - 1 })}
          >
            ‹ Atrás
          </Button>
          {last ? (
            <Button
              disabled={chosen === undefined}
              loading={submit.isPending}
              onClick={() => submit.mutate({ attemptId, stageId: stage.stageId, answers })}
            >
              Terminar
            </Button>
          ) : (
            <Button disabled={chosen === undefined} onClick={() => patch({ index: index + 1 })}>
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
    return <RevealSequence lines={lines} effect={effect} onDone={finishReveal} />;
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <ResultView result={view.result} />
      <div className="flex flex-wrap gap-3">
        <Link
          to="/panel"
          className="inline-flex min-h-11 items-center rounded-token bg-primary px-4 text-sm font-semibold text-primary-contrast"
        >
          Volver a mi panel
        </Link>
        {quiz.allowRetake ? (
          <Button
            variant="secondary"
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
  );
}
