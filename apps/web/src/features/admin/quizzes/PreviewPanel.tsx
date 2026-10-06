import {
  attemptResponseSchema,
  type AttemptResponse,
  type ResultPayload,
  type StagePayload,
} from '@libro/shared';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../../shared/api/client';
import { SafeHtml } from '../../../shared/ui/SafeHtml';
import { Button } from '../../../shared/ui/controls';
import { Alert, Card, Loading } from '../../../shared/ui/layout';
import { quizzesApi } from '../api';
import { thumbUrl } from '../components/MediaFields';
import { errorMessage } from '../errors';

/** Envía las respuestas de una etapa del intento de prueba (mismo endpoint que usa el lector). */
function submitStage(attemptId: string, stageId: string, answers: Record<string, string>) {
  return apiRequest(`/attempts/${attemptId}/stages/${stageId}/answers`, attemptResponseSchema, {
    method: 'POST',
    body: {
      answers: Object.entries(answers).map(([questionId, answerId]) => ({ questionId, answerId })),
    },
  });
}

/**
 * Vista previa en modo prueba: juega la versión PUBLICADA con un intento
 * `isTest`, que no cuenta en el avance ni en las estadísticas de nadie.
 */
export function PreviewPanel({ quizId, onClose }: { quizId: string; onClose: () => void }) {
  const [attempt, setAttempt] = useState<AttemptResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const started = useRef(false);

  const start = useMutation({
    mutationFn: () => quizzesApi.preview(quizId),
    onSuccess: setAttempt,
  });
  const submit = useMutation({
    mutationFn: ({ attemptId, stageId }: { attemptId: string; stageId: string }) =>
      submitStage(attemptId, stageId, answers),
    onSuccess: (next) => {
      setAnswers({});
      setAttempt(next);
    },
  });

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      start.mutate();
    }
  }, [start]);

  function restart() {
    setAttempt(null);
    setAnswers({});
    start.mutate();
  }

  return (
    <Card className="mb-6 border-warning">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="rounded-token bg-warning/20 px-3 py-1 text-xs font-semibold uppercase">
          Modo prueba · lo que hagas aquí no cuenta en las estadísticas ni en el progreso de nadie
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={restart}>
            Empezar de nuevo
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cerrar vista previa
          </Button>
        </div>
      </div>
      {start.isPending || submit.isPending ? <Loading /> : null}
      {start.isError ? <Alert>{errorMessage(start.error)}</Alert> : null}
      {submit.isError ? <Alert>{errorMessage(submit.error)}</Alert> : null}
      {attempt?.status === 'in_progress' ? (
        <StageView
          stage={attempt.stage}
          answers={answers}
          onAnswer={(questionId, answerId) =>
            setAnswers((current) => ({ ...current, [questionId]: answerId }))
          }
          onSubmit={() =>
            submit.mutate({ attemptId: attempt.attemptId, stageId: attempt.stage.stageId })
          }
          busy={submit.isPending}
        />
      ) : null}
      {attempt?.status === 'completed' ? <ResultView result={attempt.result} /> : null}
    </Card>
  );
}

function StageView({
  stage,
  answers,
  onAnswer,
  onSubmit,
  busy,
}: {
  stage: StagePayload;
  answers: Record<string, string>;
  onAnswer: (questionId: string, answerId: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const complete = stage.questions.every((question) => answers[question.id] !== undefined);
  return (
    <div className="flex flex-col gap-5">
      {stage.title ? <h3 className="font-display text-lg font-semibold">{stage.title}</h3> : null}
      {stage.questions.map((question, index) => (
        <fieldset key={question.id} className="flex flex-col gap-2">
          <legend className="font-medium">
            Pregunta {index + 1} de {stage.questions.length}: {question.text}
          </legend>
          {question.image ? (
            <img
              src={thumbUrl(question.image.url, 480)}
              alt={question.image.alt}
              className="max-h-40 self-start rounded-token"
            />
          ) : null}
          {question.answers.map((answer) => (
            <label
              key={answer.id}
              className="flex min-h-11 items-center gap-3 rounded-token border border-border px-3"
            >
              <input
                type="radio"
                name={question.id}
                checked={answers[question.id] === answer.id}
                onChange={() => onAnswer(question.id, answer.id)}
                className="size-5 accent-[var(--token-primary)]"
              />
              {answer.text}
            </label>
          ))}
        </fieldset>
      ))}
      <Button className="self-start" disabled={!complete || busy} onClick={onSubmit}>
        Enviar respuestas
      </Button>
    </div>
  );
}

function ResultView({ result }: { result: ResultPayload }) {
  const lines = [...(result.revealIntro?.lines ?? []), ...(result.reveal?.lines ?? [])];
  return (
    <div className="flex flex-col gap-4">
      {lines.length > 0 ? (
        <ul
          className="flex flex-col gap-1 text-sm italic text-muted"
          aria-label="Secuencia de revelado"
        >
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : null}
      {result.revealIntro?.effect || result.reveal?.effect ? (
        <p className="text-xs text-muted">
          Efecto: {result.reveal?.effect ?? result.revealIntro?.effect}
        </p>
      ) : null}
      <h3 className="font-display text-2xl font-bold">{result.title}</h3>
      {result.media?.kind === 'image' ? (
        <img
          src={thumbUrl(result.media.image.url, 640)}
          alt={result.media.image.alt}
          className="max-h-64 self-start rounded-token"
        />
      ) : null}
      {result.media?.kind === 'video' ? (
        <video
          src={result.media.video.url}
          poster={result.media.video.posterUrl}
          muted
          loop
          playsInline
          controls
          aria-label={result.media.video.alt}
          className="max-h-64 self-start rounded-token"
        />
      ) : null}
      {result.description ? <SafeHtml html={result.description} /> : null}
      {result.facts && result.facts.length > 0 ? (
        <dl className="grid gap-2 sm:grid-cols-2">
          {result.facts.map((fact, index) => (
            <div key={index} className="rounded-token bg-surface-alt p-3">
              <dt className="text-xs text-muted">{fact.label}</dt>
              <dd className="font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {result.distribution ? (
        <ul className="flex flex-col gap-1 text-sm" aria-label="Porcentaje de cada resultado">
          {result.distribution.map((row) => (
            <li key={row.key}>
              {row.title}: <strong>{row.percent}%</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
