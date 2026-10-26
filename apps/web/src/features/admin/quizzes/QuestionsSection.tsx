import { OVERLAY_MAX, overlayMinimum, QUICK_ACCENTS } from '@libro/shared';
import { useId } from 'react';
import { useMeasuredBackdrop } from '../../../shared/lib/useMeasuredBackdrop';
import { Button, CheckField } from '../../../shared/ui/controls';
import { Alert, Card } from '../../../shared/ui/layout';
import { ImageField } from '../components/MediaFields';
import { AccentField, Chip } from './AccentField';
import {
  clampStrength,
  effectiveForm,
  effectiveSampleUrl,
  LIMITS,
  mediaCounts,
  screenModel,
  type AppearanceForm,
  type QuestionForm,
} from './appearanceForm';
import { ContrastNotice } from './ContrastNotice';
import { VideoField } from './VideoField';

/** Lo que el editor sabe de las preguntas del quiz (las del borrador), agrupadas por etapa. */
export interface StageQuestions {
  id: string;
  label: string;
  questions: { id: string; text: string }[];
}

const percent = (value: number) => `${Math.round(value * 100)} %`;

/**
 * «Por pregunta»: cada pregunta usa el fondo, velo y acento generales o se personaliza. Cada campo se puede dejar «igual
 * que el general» por separado. Las preguntas se identifican por su id estable (nunca por su posición: se barajan). Los
 * topes (preguntas con fondo propio y videos) están a la vista y se aplican al elegir un medio.
 */
export function QuestionsSection({
  stages,
  form,
  onChange,
  disabled,
}: {
  stages: StageQuestions[];
  form: AppearanceForm;
  onChange: (questions: AppearanceForm['questions']) => void;
  disabled: boolean;
}) {
  const known = new Set(stages.flatMap((stage) => stage.questions.map((question) => question.id)));
  const orphans = Object.keys(form.questions).filter((id) => !known.has(id));
  const counts = mediaCounts(form);
  const total = stages.reduce((sum, stage) => sum + stage.questions.length, 0);
  const custom = Object.keys(form.questions).length;
  const set = (id: string, entry: QuestionForm | undefined) => {
    const next = { ...form.questions };
    if (entry) next[id] = entry;
    else delete next[id];
    onChange(next);
  };

  return (
    <Card className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Por pregunta</h2>
        <p className="text-sm text-muted">
          Cada pregunta puede tener su propio fondo, velo y acento; lo que no cambies es igual que
          el general. Las preguntas se barajan, así que cada ajuste va ligado a la pregunta, no a su
          lugar.
        </p>
      </div>
      <ul
        aria-label="Topes de apariencia por pregunta"
        className="flex flex-wrap gap-2 text-sm tabular-nums"
      >
        <Counter
          label="Preguntas con fondo propio"
          value={counts.questionMedia}
          max={LIMITS.maxQuestionMedia}
        />
        <Counter label="Videos (el general cuenta)" value={counts.videos} max={LIMITS.maxVideos} />
        <Counter label="Preguntas personalizadas" value={custom} max={LIMITS.maxCustomQuestions} />
      </ul>
      {total === 0 ? (
        <p className="text-sm text-muted">
          Este quiz todavía no tiene preguntas en el borrador. Agrégalas en «Etapas y preguntas».
        </p>
      ) : null}

      {stages.map((stage) =>
        stage.questions.length === 0 ? null : (
          <section key={stage.id} aria-label={stage.label} className="flex min-w-0 flex-col gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {stage.label}
            </h3>
            <ol className="flex flex-col divide-y divide-border">
              {stage.questions.map((question, index) => (
                <QuestionRow
                  key={question.id}
                  number={index + 1}
                  question={question}
                  entry={form.questions[question.id]}
                  form={form}
                  onChange={(entry) => set(question.id, entry)}
                  disabled={disabled}
                />
              ))}
            </ol>
          </section>
        ),
      )}

      {orphans.length > 0 ? (
        <Alert tone="warning" title="Personalizaciones sin pregunta">
          <p className="mb-2">
            Estos ajustes son de preguntas que ya no están en el borrador. Las lectoras no los ven;
            puedes quitarlos.
          </p>
          <ul className="flex flex-col gap-2">
            {orphans.map((id) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2">
                <code className="break-all text-xs">{id}</code>
                <Button variant="secondary" disabled={disabled} onClick={() => set(id, undefined)}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
    </Card>
  );
}

function Counter({ label, value, max }: { label: string; value: number; max: number }) {
  const full = value >= max;
  return (
    <li
      className={`rounded-full border px-3 py-1 ${full ? 'border-warning text-warning' : 'border-border text-muted'}`}
    >
      {label}: <strong>{value}</strong> de {max}
      {full ? ' (tope)' : ''}
    </li>
  );
}

function QuestionRow({
  number,
  question,
  entry,
  form,
  onChange,
  disabled,
}: {
  number: number;
  question: { id: string; text: string };
  entry: QuestionForm | undefined;
  form: AppearanceForm;
  onChange: (entry: QuestionForm | undefined) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <li className="flex min-w-0 flex-col gap-3 py-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            Pregunta {number}
            {entry ? (
              <span className="ml-2 whitespace-nowrap text-xs font-normal text-primary">
                Personalizada
              </span>
            ) : null}
          </p>
          <p
            className="line-clamp-2 text-sm text-muted [overflow-wrap:anywhere]"
            title={question.text}
          >
            {question.text || '(sin texto todavía)'}
          </p>
        </div>
        <fieldset className="flex flex-wrap gap-2" disabled={disabled}>
          <legend className="sr-only">Apariencia de la pregunta {number}</legend>
          <Chip name={`${id}-mode`} checked={!entry} onSelect={() => onChange(undefined)}>
            Usar el general
          </Chip>
          <Chip name={`${id}-mode`} checked={Boolean(entry)} onSelect={() => onChange(entry ?? {})}>
            Personalizar
          </Chip>
        </fieldset>
      </div>
      {entry ? (
        <QuestionFields
          number={number}
          entry={entry}
          form={form}
          onChange={onChange}
          disabled={disabled}
        />
      ) : null}
    </li>
  );
}

function QuestionFields({
  number,
  entry,
  form,
  onChange,
  disabled,
}: {
  number: number;
  entry: QuestionForm;
  form: AppearanceForm;
  onChange: (entry: QuestionForm | undefined) => void;
  disabled: boolean;
}) {
  const id = useId();
  const counts = mediaCounts(form);
  const own = entry.background;
  const ownHasMedia =
    (own?.kind === 'image' && Boolean(own.image)) || (own?.kind === 'video' && Boolean(own.video));
  const ownIsVideo = own?.kind === 'video' && Boolean(own.video);
  const mediaFull = counts.questionMedia >= LIMITS.maxQuestionMedia && !ownHasMedia;
  const videosFull = counts.videos >= LIMITS.maxVideos && !ownIsVideo;
  const patch = (changes: Partial<QuestionForm>) => onChange({ ...entry, ...changes });
  const without = (field: keyof QuestionForm): QuestionForm => {
    const { [field]: _removed, ...rest } = entry;
    return rest;
  };

  // El contraste de ESTA pregunta, con la medida de su propio fondo (igual que en el lector).
  const measured = useMeasuredBackdrop(
    effectiveSampleUrl(effectiveForm(form, entry)),
    (entry.overlay?.mode ?? form.mode) === 'auto',
  );
  const model = screenModel(form, entry, measured);
  const overlay = entry.overlay;

  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-token border border-border p-3">
      {/* Fondo */}
      <div className="flex min-w-0 flex-col gap-2">
        <CheckField
          label="Fondo: igual que el general"
          checked={own === undefined}
          disabled={disabled}
          onChange={(same) =>
            onChange(same ? without('background') : { ...entry, background: { kind: 'none' } })
          }
        />
        {own !== undefined ? (
          <>
            <fieldset className="flex flex-wrap gap-2" disabled={disabled}>
              <legend className="sr-only">Fondo propio de la pregunta {number}</legend>
              <Chip
                name={`${id}-bg`}
                checked={own.kind === 'none'}
                onSelect={() => patch({ background: { kind: 'none' } })}
              >
                Sin fondo
              </Chip>
              <Chip
                name={`${id}-bg`}
                checked={own.kind === 'image'}
                onSelect={() => {
                  if (!mediaFull) patch({ background: { kind: 'image', image: undefined } });
                }}
              >
                <span title={mediaFull ? 'Ya hay 5 preguntas con fondo propio' : undefined}>
                  Imagen{mediaFull ? ' (tope)' : ''}
                </span>
              </Chip>
              <Chip
                name={`${id}-bg`}
                checked={own.kind === 'video'}
                onSelect={() => {
                  if (!mediaFull && !videosFull)
                    patch({ background: { kind: 'video', video: undefined } });
                }}
              >
                <span
                  title={
                    mediaFull
                      ? 'Ya hay 5 preguntas con fondo propio'
                      : videosFull
                        ? 'Ya hay 4 videos en el quiz'
                        : undefined
                  }
                >
                  Video corto{mediaFull || videosFull ? ' (tope)' : ''}
                </span>
              </Chip>
            </fieldset>
            {own.kind === 'image' ? (
              <ImageField
                label={`Imagen de la pregunta ${number}`}
                purpose="quiz-bg"
                value={own.image}
                onChange={(image) => patch({ background: { kind: 'image', image } })}
                altMaxLength={200}
                hint="JPG, PNG, WebP o GIF, hasta 10 MB."
              />
            ) : null}
            {own.kind === 'video' ? (
              <VideoField
                value={own.video}
                onChange={(video) => patch({ background: { kind: 'video', video } })}
                disabled={disabled}
              />
            ) : null}
            {(own.kind === 'image' && !own.image) || (own.kind === 'video' && !own.video) ? (
              <p className="text-sm text-warning" role="status">
                Sube el archivo o elige «Sin fondo» (hasta entonces no se puede guardar).
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Velo */}
      <div className="flex min-w-0 flex-col gap-2">
        <CheckField
          label="Velo: igual que el general"
          checked={overlay === undefined}
          disabled={disabled}
          onChange={(same) =>
            onChange(
              same
                ? without('overlay')
                : {
                    ...entry,
                    overlay: { mode: form.mode, strength: clampStrength(form.mode, form.strength) },
                  },
            )
          }
        />
        {overlay ? (
          <>
            <fieldset className="flex flex-wrap gap-2" disabled={disabled}>
              <legend className="sr-only">Modo del velo de la pregunta {number}</legend>
              {(
                [
                  ['auto', 'Automático'],
                  ['manual', 'Manual'],
                ] as const
              ).map(([mode, label]) => (
                <Chip
                  key={mode}
                  name={`${id}-overlay`}
                  checked={overlay.mode === mode}
                  onSelect={() =>
                    patch({ overlay: { mode, strength: clampStrength(mode, overlay.strength) } })
                  }
                >
                  {label}
                </Chip>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1">
              <label
                htmlFor={`${id}-strength`}
                className="flex justify-between text-sm font-medium"
              >
                <span>Intensidad</span>
                <span className="tabular-nums">
                  {model.eff.kind === 'none' ? '—' : percent(model.strength)}
                </span>
              </label>
              <input
                id={`${id}-strength`}
                type="range"
                min={overlayMinimum(overlay.mode)}
                max={OVERLAY_MAX}
                step={0.01}
                value={model.eff.kind === 'none' ? overlayMinimum(overlay.mode) : model.strength}
                disabled={disabled || overlay.mode === 'auto' || model.eff.kind === 'none'}
                onChange={(event) =>
                  patch({
                    overlay: {
                      mode: 'manual',
                      strength: clampStrength('manual', Number(event.target.value)),
                    },
                  })
                }
                className="min-h-11 w-full accent-[var(--token-primary)]"
              />
            </div>
          </>
        ) : null}
      </div>

      {/* Acento */}
      <div className="flex min-w-0 flex-col gap-2">
        <CheckField
          label="Acento: igual que el general"
          checked={entry.accent === undefined}
          disabled={disabled}
          onChange={(same) =>
            onChange(
              same ? without('accent') : { ...entry, accent: form.accent ?? QUICK_ACCENTS[0].hex },
            )
          }
        />
        {entry.accent !== undefined ? (
          <AccentField
            value={entry.accent}
            onChange={(accent) => (accent ? patch({ accent }) : onChange(without('accent')))}
            result={model.accent}
            backdrop={model.accentSurface}
            disabled={disabled}
            allowDefault={false}
          />
        ) : null}
      </div>

      {model.report ? (
        <ContrastNotice report={model.report} title={`Contraste de la pregunta ${number}`} />
      ) : null}
    </div>
  );
}
