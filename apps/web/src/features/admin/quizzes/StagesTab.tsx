import { memo, useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  Button,
  CheckField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../shared/ui/controls';
import { Alert, Badge, Card, EmptyState } from '../../../shared/ui/layout';
import { AdminIcon } from '../../../shared/ui/adminIcons';
import { ImageField } from '../components/MediaFields';
import {
  addAnswer,
  addQuestion,
  addStage,
  duplicateQuestion,
  moveQuestion,
  removeAnswer,
  removeQuestion,
  removeStage,
  resultsOfStage,
  setCondition,
  setQuestionImage,
  updateAnswer,
  updateQuestion,
  updateStage,
  type Draft,
  type DraftQuestion,
  type DraftStage,
} from './draft';
import { useConfirm } from '../components/ConfirmDialog';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function stageLabel(draft: Draft, stage: DraftStage): string {
  const parent = draft.stages.find((candidate) => candidate.id === stage.conditionStageId);
  const base = stage.title?.trim() || stage.id;
  return parent ? `${base} (condicional)` : base;
}

/** Pestaña «Preguntas». */
export function StagesTab({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: Dispatch<SetStateAction<Draft>>;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(draft.stages[0]?.id);
  const stage = draft.stages.find((candidate) => candidate.id === selectedId) ?? draft.stages[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
      <Card className="flex flex-col gap-2 self-start">
        <h2 className="font-semibold">Etapas</h2>
        {draft.stages.length === 0 ? (
          <p className="text-sm text-muted">
            Todavía no hay etapas. Una etapa es un grupo de preguntas.
          </p>
        ) : null}
        <ul className="flex flex-col gap-1">
          {draft.stages.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.id === stage?.id}
                onClick={() => setSelectedId(item.id)}
                className={`flex min-h-11 w-full flex-col items-start justify-center rounded-token px-3 text-left text-sm ${
                  item.id === stage?.id ? 'bg-surface-alt font-semibold' : 'hover:bg-surface-alt'
                }`}
              >
                <span>{stageLabel(draft, item)}</span>
                <span className="text-xs font-normal text-muted">
                  {item.questions.length} preguntas
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          onClick={() => {
            const next = addStage(draft);
            onChange(next);
            setSelectedId(next.stages[next.stages.length - 1]?.id);
          }}
        >
          + Agregar etapa
        </Button>
      </Card>

      {stage ? (
        <StageEditor
          key={stage.id}
          draft={draft}
          stage={stage}
          onChange={onChange}
          onRemoved={() => setSelectedId(undefined)}
        />
      ) : (
        <EmptyState title="Empieza agregando la primera etapa">
          Un quiz simple tiene una sola etapa. Uno con ramas (p. ej. «según el campo, la pregunta
          del poder») tiene una etapa inicial y etapas condicionales.
        </EmptyState>
      )}
    </div>
  );
}

function StageEditor({
  draft,
  stage,
  onChange,
  onRemoved,
}: {
  draft: Draft;
  stage: DraftStage;
  onChange: Dispatch<SetStateAction<Draft>>;
  onRemoved: () => void;
}) {
  const confirm = useConfirm();
  const results = resultsOfStage(draft, stage.id);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    // Con pocas preguntas se ven abiertas; con muchas, plegadas (se abre la que se necesita).
    () => new Set(stage.questions.length <= 3 ? stage.questions.map((q) => q.id) : []),
  );
  const toggle = useCallback(
    (id: string) =>
      setOpenIds((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  const resultOptions = useMemo(
    () =>
      draft.results
        .filter((result) => result.stageId === stage.id)
        .map((result) => ({ value: result.key, label: result.title || result.key })),
    [draft.results, stage.id],
  );
  const answersCount = stage.questions.reduce((sum, question) => sum + question.answers.length, 0);
  const parents = draft.stages.filter((candidate) => candidate.id !== stage.id);
  const parentResults = stage.conditionStageId ? resultsOfStage(draft, stage.conditionStageId) : [];
  const isConditional = stage.conditionStageId !== undefined;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Etapa «{stage.title?.trim() || stage.id}»</h2>
          {isConditional ? <Badge tone="warning">Condicional</Badge> : null}
        </div>
        <TextField
          label="Nombre de la etapa (opcional)"
          value={stage.title ?? ''}
          onChange={(event) => {
            const { title: _removed, ...rest } = stage;
            onChange({
              ...draft,
              stages: draft.stages.map((s) =>
                s.id === stage.id
                  ? event.target.value
                    ? { ...rest, title: event.target.value }
                    : rest
                  : s,
              ),
            });
          }}
        />
        <CheckField
          label="Mezclar el orden de las preguntas"
          checked={stage.shuffleQuestions ?? true}
          onChange={(value) => onChange(updateStage(draft, stage.id, { shuffleQuestions: value }))}
        />
        <CheckField
          label="Mezclar el orden de las respuestas"
          hint="Cada intento las ve en otro orden, así la posición no delata el resultado. Cambiarlo requiere publicar de nuevo."
          checked={stage.shuffleAnswers ?? true}
          onChange={(value) => onChange(updateStage(draft, stage.id, { shuffleAnswers: value }))}
        />
        <CheckField
          label="Esta etapa da el resultado final"
          hint="Apágalo si después sigue otra etapa."
          checked={stage.producesFinal}
          onChange={(value) => onChange(updateStage(draft, stage.id, { producesFinal: value }))}
        />
        {parents.length > 0 ? (
          <fieldset className="flex flex-col gap-3 rounded-token border border-border p-3">
            <legend className="px-1 text-sm font-medium">¿Viene después de otra etapa?</legend>
            <SelectField
              label="¿Después de qué etapa?"
              value={stage.conditionStageId ?? ''}
              placeholder="No, es la primera"
              options={parents.map((parent) => ({
                value: parent.id,
                label: stageLabel(draft, parent),
              }))}
              onChange={(event) =>
                onChange(
                  setCondition(
                    draft,
                    stage.id,
                    event.target.value
                      ? { parentId: event.target.value, resultKey: '' }
                      : undefined,
                  ),
                )
              }
            />
            {isConditional ? (
              <SelectField
                label="Solo si el resultado anterior fue…"
                value={stage.conditionResultKey ?? ''}
                placeholder="Elige un resultado"
                options={parentResults.map((result) => ({
                  value: result.key,
                  label: result.title || result.key,
                }))}
                hint={
                  parentResults.length === 0
                    ? 'Primero crea los resultados de la etapa anterior (pestaña Resultados).'
                    : undefined
                }
                onChange={(event) =>
                  onChange(
                    setCondition(draft, stage.id, {
                      parentId: stage.conditionStageId ?? '',
                      resultKey: event.target.value,
                    }),
                  )
                }
              />
            ) : null}
          </fieldset>
        ) : null}
        {results.length < 2 ? (
          <Alert
            tone="warning"
            title="Para repartir las respuestas, la etapa necesita al menos 2 resultados"
          >
            Créalos en la pestaña «Resultados» para poder asignarlos a las respuestas.
          </Alert>
        ) : null}
        <Button
          variant="danger"
          className="self-start"
          onClick={async () => {
            const ok = await confirm({
              title: '¿Quitar esta etapa?',
              message:
                'Se quitan sus preguntas y resultados, y las etapas que dependen de ella. Es un cambio del borrador: puedes descartarlo antes de guardar.',
              confirmLabel: 'Quitar etapa',
              tone: 'danger',
            });
            if (!ok) return;
            onChange(removeStage(draft, stage.id));
            onRemoved();
          }}
        >
          Quitar etapa
        </Button>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold">Preguntas</h2>
            <p className="text-sm text-muted">
              {plural(stage.questions.length, 'pregunta', 'preguntas')} ·{' '}
              {plural(answersCount, 'respuesta', 'respuestas')}
            </p>
          </div>
          {stage.questions.length > 1 ? (
            <Button
              variant="ghost"
              onClick={() =>
                setOpenIds(
                  openIds.size === stage.questions.length
                    ? new Set()
                    : new Set(stage.questions.map((question) => question.id)),
                )
              }
            >
              {openIds.size === stage.questions.length ? 'Plegar todas' : 'Abrir todas'}
            </Button>
          ) : null}
        </div>
        {stage.questions.map((question, index) => (
          <QuestionEditor
            key={question.id}
            stageId={stage.id}
            shuffleAnswers={stage.shuffleAnswers ?? true}
            question={question}
            index={index}
            total={stage.questions.length}
            resultOptions={resultOptions}
            update={onChange}
            open={openIds.has(question.id)}
            onToggle={toggle}
          />
        ))}
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            const next = addQuestion(draft, stage.id);
            onChange(next);
            // La pregunta nueva se abre sola para escribirla.
            const created = next.stages
              .find((candidate) => candidate.id === stage.id)
              ?.questions.at(-1);
            if (created) setOpenIds((current) => new Set(current).add(created.id));
          }}
        >
          + Agregar pregunta
        </Button>
      </div>
    </div>
  );
}

type DraftUpdate = (update: (current: Draft) => Draft) => void;

/**
 * Una pregunta del editor. Está memoizada y recibe solo lo suyo (su pregunta, opciones de resultado estables y una
 * función que actualiza el borrador): así, al teclear en una, las demás no se vuelven a dibujar (con 60 abiertas,
 * cada letra costaba cientos de milisegundos).
 */
const QuestionEditor = memo(function QuestionEditor({
  stageId,
  shuffleAnswers,
  question,
  index,
  total,
  resultOptions,
  update,
  open,
  onToggle,
}: {
  stageId: string;
  shuffleAnswers: boolean;
  question: DraftQuestion;
  index: number;
  total: number;
  resultOptions: { value: string; label: string }[];
  update: DraftUpdate;
  open: boolean;
  onToggle: (questionId: string) => void;
}) {
  return (
    <Card as="article" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 flex-1 font-medium">
          <button
            type="button"
            className="admin-fold"
            aria-expanded={open}
            aria-label={`Pregunta ${index + 1}`}
            onClick={() => onToggle(question.id)}
          >
            <AdminIcon name="chevron" className={`size-4 shrink-0 ${open ? 'rotate-90' : ''}`} />
            <span className="min-w-0">
              <span className="block">Pregunta {index + 1}</span>
              <span className="admin-fold-summary">
                {question.text.trim() || 'Sin texto todavía'} ·{' '}
                {plural(question.answers.length, 'respuesta', 'respuestas')}
              </span>
            </span>
          </button>
        </h3>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="ghost"
            aria-label={`Subir la pregunta ${index + 1}`}
            disabled={index === 0}
            onClick={() => update((current) => moveQuestion(current, stageId, question.id, -1))}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            aria-label={`Bajar la pregunta ${index + 1}`}
            disabled={index === total - 1}
            onClick={() => update((current) => moveQuestion(current, stageId, question.id, 1))}
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            onClick={() => update((current) => duplicateQuestion(current, stageId, question.id))}
          >
            Duplicar
          </Button>
          <Button
            variant="ghost"
            onClick={() => update((current) => removeQuestion(current, stageId, question.id))}
          >
            Eliminar
          </Button>
        </div>
      </div>
      {open ? (
        <>
          <TextAreaField
            label="Texto de la pregunta"
            value={question.text}
            maxLength={1000}
            onChange={(event) =>
              update((current) =>
                updateQuestion(current, stageId, question.id, { text: event.target.value }),
              )
            }
          />
          <ImageField
            label="Imagen (opcional)"
            purpose="quiz"
            value={question.image}
            onChange={(image) =>
              update((current) => setQuestionImage(current, stageId, question.id, image))
            }
          />
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Respuestas</legend>
            {question.answers.map((answer, position) => (
              <div key={answer.id} className="flex flex-col gap-1">
                <div className="grid gap-2 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
                  <TextField
                    label={`Respuesta ${position + 1}`}
                    value={answer.text}
                    maxLength={500}
                    onChange={(event) =>
                      update((current) =>
                        updateAnswer(current, stageId, question.id, answer.id, {
                          text: event.target.value,
                        }),
                      )
                    }
                  />
                  <SelectField
                    label="Resultado al que suma esta respuesta"
                    value={answer.resultKey}
                    placeholder="Ninguno"
                    options={resultOptions}
                    onChange={(event) =>
                      update((current) =>
                        updateAnswer(current, stageId, question.id, answer.id, {
                          resultKey: event.target.value,
                        }),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    aria-label={`Quitar la respuesta ${position + 1}`}
                    onClick={() =>
                      update((current) => removeAnswer(current, stageId, question.id, answer.id))
                    }
                  >
                    ✕
                  </Button>
                </div>
                {shuffleAnswers ? (
                  <CheckField
                    label={`Dejar la respuesta ${position + 1} al final`}
                    hint={
                      position === 0
                        ? 'Se queda al final aunque se mezclen las demás (p. ej. «Ninguna de las anteriores»).'
                        : undefined
                    }
                    checked={answer.pinLast ?? false}
                    onChange={(value) =>
                      update((current) =>
                        updateAnswer(current, stageId, question.id, answer.id, { pinLast: value }),
                      )
                    }
                  />
                ) : null}
              </div>
            ))}
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => update((current) => addAnswer(current, stageId, question.id))}
            >
              + Respuesta
            </Button>
          </fieldset>
        </>
      ) : null}
    </Card>
  );
});
