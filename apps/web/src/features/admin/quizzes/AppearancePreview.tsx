import { formatDecimal, type ImageRefInput } from '@libro/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { posterUrl, thumbUrl } from '../../../shared/lib/cloudinary';
import { useMeasuredBackdrop } from '../../../shared/lib/useMeasuredBackdrop';
import { SafeHtml } from '../../../shared/ui/SafeHtml';
import {
  effectiveSampleUrl,
  screenModel,
  type AppearanceForm,
  type QuestionForm,
} from './appearanceForm';
import { ContrastNotice } from './ContrastNotice';
import type { StageQuestions } from './QuestionsSection';

/** Tamaños de pantalla que se comparan: un celular y un escritorio. */
export const PREVIEW_SIZES = {
  movil: { label: 'Celular · 375 px', width: 375, height: 720 },
  escritorio: { label: 'Escritorio · 1280 px', width: 1280, height: 760 },
} as const;
type SizeKey = keyof typeof PREVIEW_SIZES;

const GENERAL = 'general';

/** Reduce una pantalla de tamaño real para que quepa en la columna, sin cambiar cómo se ve por dentro. */
function ScaledFrame({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(width);
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setAvailable(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, available / width);
  return (
    <div ref={box} className="w-full">
      <div
        className="mx-auto overflow-hidden rounded-token-lg border border-border"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          // El contenido de muestra no es interactivo: es una imagen de cómo se verá.
          inert
        >
          {children}
        </div>
      </div>
    </div>
  );
}

interface Variant {
  id: string;
  label: string;
  text: string;
  /** Posición dentro de su etapa y total de la etapa (para la barra de avance). */
  index: number;
  total: number;
}

/** Todas las pantallas que se pueden previsualizar además del general, en el orden del borrador. */
function variantsOf(stages: StageQuestions[]): Variant[] {
  const multiple = stages.filter((stage) => stage.questions.length > 0).length > 1;
  return stages.flatMap((stage, stageIndex) =>
    stage.questions.map((question, index) => ({
      id: question.id,
      label: `${multiple ? `Etapa ${stageIndex + 1} · ` : ''}Pregunta ${index + 1}`,
      text: question.text,
      index,
      total: stage.questions.length,
    })),
  );
}

/**
 * Cómo verá la lectora el quiz con lo que se está editando, a 375 px y a 1280 px: la introducción con el general o una
 * pregunta concreta con sus ajustes propios. Usa las mismas clases que la pantalla real y calcula velo, acento y
 * contraste como el lector (con la medida del fondo de ESA pantalla); el video se ve como su póster.
 */
export function AppearancePreview({
  form,
  title,
  position,
  stages,
}: {
  form: AppearanceForm;
  title: string;
  /** «Quiz N de M» real de este quiz en su libro; mientras se carga, solo «Quiz». */
  position: { index: number; total: number } | undefined;
  stages: StageQuestions[];
}) {
  const [size, setSize] = useState<SizeKey>('movil');
  const [selected, setSelected] = useState(GENERAL);
  const variants = variantsOf(stages);
  // Si la pregunta elegida ya no existe (se quitó del borrador), se vuelve al general.
  const variant = variants.find((item) => item.id === selected);
  const entry: QuestionForm | undefined = variant ? form.questions[variant.id] : undefined;
  const { width, height } = PREVIEW_SIZES[size];

  const model = useScreenModel(form, entry);
  const eff = model.eff;
  const mediaSrc =
    eff.kind === 'image' && eff.image
      ? thumbUrl(eff.image.url, 1080)
      : eff.kind === 'video' && eff.video
        ? posterUrl(eff.video.posterUrl, 960)
        : undefined;
  const style = {
    '--quiz-veil': model.strength,
    ...(model.accent ? { '--quiz-accent': model.accent.hex } : {}),
  } as CSSProperties;
  const custom = variants.filter((item) => form.questions[item.id] !== undefined);

  return (
    <section aria-label="Vista previa" className="flex flex-col gap-3">
      <div className="lg:sticky lg:top-0 z-10 -mx-1 flex flex-wrap items-end gap-3 bg-bg px-1 pb-2">
        <div role="group" aria-label="Tamaño de la vista previa" className="flex flex-wrap gap-2">
          {(Object.keys(PREVIEW_SIZES) as SizeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={size === key}
              onClick={() => setSize(key)}
              className={`min-h-11 rounded-full border px-4 text-sm transition-colors duration-(--token-dur-fast) ease-token-out ${
                size === key
                  ? 'border-primary bg-surface-alt text-text'
                  : 'border-border text-muted hover:text-text'
              }`}
            >
              {PREVIEW_SIZES[key].label}
            </button>
          ))}
        </div>
        <label className="flex min-w-0 basis-full flex-col gap-1 text-sm font-medium sm:basis-0 sm:flex-1">
          Pantalla
          <select
            value={variant ? variant.id : GENERAL}
            onChange={(event) => setSelected(event.target.value)}
            className="min-h-11 min-w-0 rounded-xl border border-border bg-bg/60 px-3 text-base font-normal text-text focus:border-primary focus:shadow-focus focus:outline-none"
          >
            <option value={GENERAL}>General (introducción)</option>
            {variants.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
                {form.questions[item.id] ? ' · personalizada' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ScaledFrame width={width} height={height}>
        <div className="quiz-preview" style={style} data-size={size} data-testid="quiz-preview">
          <div className="quiz-bg" data-contained data-loaded>
            {mediaSrc ? <img src={mediaSrc} alt="" className="quiz-bg-media" /> : null}
            <div className="quiz-bg-veil" />
          </div>
          <div className="quiz-preview-page mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex min-h-11 items-center px-3 text-sm font-semibold">
                ‹ Volver al panel
              </span>
              {eff.kind === 'video' ? (
                <span className="playback-toggle" aria-hidden="true">
                  Pausar
                </span>
              ) : null}
            </div>
            {variant ? (
              <QuestionScreen variant={variant} />
            ) : (
              <IntroScreen form={form} title={title} position={position} />
            )}
          </div>
        </div>
      </ScaledFrame>

      {model.report ? (
        <ContrastNotice
          report={model.report}
          title={`Contraste · ${variant ? variant.label : 'General'}`}
        />
      ) : null}
      {custom.length > 0 ? (
        <section
          aria-label="Contraste de las preguntas personalizadas"
          className="flex flex-col gap-1 rounded-token border border-border p-3 text-sm"
        >
          <h3 className="font-medium">Contraste de las preguntas personalizadas</h3>
          <ul className="flex flex-col divide-y divide-border">
            {custom.map((item) => (
              <CustomContrast
                key={item.id}
                label={item.label}
                form={form}
                entry={form.questions[item.id]}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

/** Velo, acento y contraste de una pantalla, con la medida del fondo que de verdad se ve en ella. */
function useScreenModel(form: AppearanceForm, entry: QuestionForm | undefined) {
  const probe = screenModel(form, entry, { hex: undefined, measuring: true });
  const measured = useMeasuredBackdrop(effectiveSampleUrl(probe.eff), probe.eff.mode === 'auto');
  return screenModel(form, entry, measured);
}

function CustomContrast({
  label,
  form,
  entry,
}: {
  label: string;
  form: AppearanceForm;
  entry: QuestionForm | undefined;
}) {
  const model = useScreenModel(form, entry);
  const report = model.report;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
      <span>{label}</span>
      {report ? (
        <span className={report.ok ? 'text-success' : 'text-warning'}>
          {report.ok ? 'Se lee bien' : 'Ojo: puede leerse mal'} · texto {formatDecimal(report.text)}
          :1
          {report.accent !== undefined ? ` · acento ${formatDecimal(report.accent)}:1` : ''}
        </span>
      ) : (
        <span className="text-muted">Sin fondo propio: color liso</span>
      )}
    </li>
  );
}

function IntroScreen({
  form,
  title,
  position,
}: {
  form: AppearanceForm;
  title: string;
  position: { index: number; total: number } | undefined;
}) {
  return (
    <>
      <div className="quiz-hero">
        <CoverImage key={form.cover?.url} cover={form.cover} />
        <div className="quiz-hero-content">
          <p className="label">
            {position ? `Quiz ${position.index} de ${position.total}` : 'Quiz'}
          </p>
          <p className="page-title quiz-accent-title text-h2 [text-wrap:balance]">
            {title || 'Título del quiz'}
          </p>
        </div>
      </div>
      {form.introHtml ? <SafeHtml html={form.introHtml} /> : null}
      <p className="text-sm text-muted">
        No hay respuestas correctas: elige la que más va contigo.
      </p>
      <div className="flex flex-col gap-3">
        <p className="text-xl font-semibold leading-snug">Pregunta de muestra</p>
        <div className="option">Una respuesta de muestra</div>
        <div className="option">Otra respuesta, un poco más larga que la anterior</div>
      </div>
      <span className="btn btn-primary btn-lg self-start">Comenzar</span>
    </>
  );
}

/** La pantalla de una pregunta tal como la ve la lectora: avance, texto real y respuestas de muestra. */
function QuestionScreen({ variant }: { variant: Variant }) {
  return (
    <>
      <p className="text-sm text-muted">
        Pregunta {variant.index + 1} de {variant.total}
      </p>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: variant.total }, (_, position) => (
          <span
            key={position}
            className={`h-1.5 flex-1 rounded-full ${position <= variant.index ? 'quiz-accent-fill' : 'bg-unlit/40'}`}
          />
        ))}
      </div>
      <p className="text-2xl font-semibold leading-snug [overflow-wrap:anywhere]">
        {variant.text || '(sin texto todavía)'}
      </p>
      <div className="flex flex-col gap-3">
        <div className="option">Una respuesta de muestra</div>
        <div className="option">Otra respuesta, un poco más larga que la anterior</div>
      </div>
      <div className="flex gap-3">
        <span className="btn btn-secondary btn-lg">‹ Atrás</span>
        <span className="btn btn-primary btn-lg flex-1 justify-center">Siguiente ›</span>
      </div>
    </>
  );
}

function CoverImage({ cover }: { cover: ImageRefInput | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!cover || failed) return null;
  return (
    <img
      src={thumbUrl(cover.url, 1200)}
      alt=""
      className="quiz-hero-img"
      onError={() => setFailed(true)}
    />
  );
}
