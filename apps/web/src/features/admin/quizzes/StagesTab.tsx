import { useState } from 'react';
import {
  Button,
  CheckField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../../shared/ui/controls';
import { Alert, Badge, Card, EmptyState } from '../../../shared/ui/layout';
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

function stageLabel(draft: Draft, stage: DraftStage): string {
  const parent = draft.stages.find((candidate) => candidate.id === stage.conditionStageId);
  const base = stage.title?.trim() || stage.id;
  return parent ? `${base} (condicional)` : base;
}

/** Pestaña «Etapas y preguntas». */
export function StagesTab({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const [selectedId, setSelectedId] = useState<string | undefined>(draft.stages[0]?.id);
  const stage = draft.stages.find((candidate) => candidate.id === selectedId) ?? draft.stages[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
      <Card className="flex flex-col gap-2 self-start">
        <h2 className="font-semibold">Etapas</h2>
        {draft.stages.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay etapas.</p>
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
  onChange: (draft: Draft) => void;
  onRemoved: () => void;
}) {
  const results = resultsOfStage(draft, stage.id);
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
          label="Barajar las preguntas de esta etapa"
          checked={stage.shuffleQuestions ?? true}
          onChange={(value) => onChange(updateStage(draft, stage.id, { shuffleQuestions: value }))}
        />
        <CheckField
          label="El resultado de esta etapa es el resultado final del quiz"
          hint="Desactívalo si después sigue otra etapa."
          checked={stage.producesFinal}
          onChange={(value) => onChange(updateStage(draft, stage.id, { producesFinal: value }))}
        />
        {parents.length > 0 ? (
          <fieldset className="flex flex-col gap-3 rounded-token border border-border p-3">
            <legend className="px-1 text-sm font-medium">
              ¿Solo se ejecuta según un resultado anterior?
            </legend>
            <SelectField
              label="Etapa anterior"
              value={stage.conditionStageId ?? ''}
              placeholder="No, es una etapa inicial"
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
                label="Si el resultado fue…"
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
          <Alert tone="warning" title="Esta etapa necesita al menos 2 resultados">
            Créalos en la pestaña «Resultados» para poder asignarlos a las respuestas.
          </Alert>
        ) : null}
        <Button
          variant="danger"
          className="self-start"
          onClick={() => {
            if (
              window.confirm(
                '¿Quitar esta etapa con sus preguntas, resultados y las etapas que dependen de ella?',
              )
            ) {
              onChange(removeStage(draft, stage.id));
              onRemoved();
            }
          }}
        >
          Quitar etapa
        </Button>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="font-semibold">Preguntas ({stage.questions.length})</h2>
        {stage.questions.map((question, index) => (
          <QuestionEditor
            key={question.id}
            draft={draft}
            stage={stage}
            question={question}
            index={index}
            results={results}
            onChange={onChange}
          />
        ))}
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => onChange(addQuestion(draft, stage.id))}
        >
          + Pregunta
        </Button>
      </div>
    </div>
  );
}

function QuestionEditor({
  draft,
  stage,
  question,
  index,
  results,
  onChange,
}: {
  draft: Draft;
  stage: DraftStage;
  question: DraftQuestion;
  index: number;
  results: { key: string; title: string }[];
  onChange: (draft: Draft) => void;
}) {
  const resultOptions = results.map((result) => ({
    value: result.key,
    label: result.title || result.key,
  }));
  return (
    <Card as="article" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Pregunta {index + 1}</h3>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="ghost"
            aria-label={`Subir la pregunta ${index + 1}`}
            disabled={index === 0}
            onClick={() => onChange(moveQuestion(draft, stage.id, question.id, -1))}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            aria-label={`Bajar la pregunta ${index + 1}`}
            disabled={index === stage.questions.length - 1}
            onClick={() => onChange(moveQuestion(draft, stage.id, question.id, 1))}
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            onClick={() => onChange(duplicateQuestion(draft, stage.id, question.id))}
          >
            Duplicar
          </Button>
          <Button
            variant="ghost"
            onClick={() => onChange(removeQuestion(draft, stage.id, question.id))}
          >
            Eliminar
          </Button>
        </div>
      </div>
      <TextAreaField
        label="Texto de la pregunta"
        value={question.text}
        maxLength={1000}
        onChange={(event) =>
          onChange(updateQuestion(draft, stage.id, question.id, { text: event.target.value }))
        }
      />
      <ImageField
        label="Imagen (opcional)"
        purpose="quiz"
        value={question.image}
        onChange={(image) => onChange(setQuestionImage(draft, stage.id, question.id, image))}
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Respuestas y el resultado al que suman</legend>
        {question.answers.map((answer, position) => (
          <div key={answer.id} className="grid gap-2 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
            <TextField
              label={`Respuesta ${position + 1}`}
              value={answer.text}
              maxLength={500}
              onChange={(event) =>
                onChange(
                  updateAnswer(draft, stage.id, question.id, answer.id, {
                    text: event.target.value,
                  }),
                )
              }
            />
            <SelectField
              label="Suma al resultado"
              value={answer.resultKey}
              placeholder="Sin resultado"
              options={resultOptions}
              onChange={(event) =>
                onChange(
                  updateAnswer(draft, stage.id, question.id, answer.id, {
                    resultKey: event.target.value,
                  }),
                )
              }
            />
            <Button
              variant="ghost"
              aria-label={`Quitar la respuesta ${position + 1}`}
              onClick={() => onChange(removeAnswer(draft, stage.id, question.id, answer.id))}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => onChange(addAnswer(draft, stage.id, question.id))}
        >
          + Respuesta
        </Button>
      </fieldset>
    </Card>
  );
}
