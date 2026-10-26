import {
  APPEARANCE_LIMITS,
  OVERLAY_MAX,
  OVERLAY_MIN,
  overlayMinimum,
  type AppearanceAccent,
  type AppearanceField,
  type BackgroundVideo,
  type ImageRefInput,
  type QuizAppearance,
  type QuizAppearanceInput,
} from '@libro/shared';
import { OVERLAY_FLOOR } from '@libro/shared';
import { readableAccent, type ReadableAccent } from '../../../shared/lib/accent';
import { posterUrl, thumbUrl } from '../../../shared/lib/cloudinary';
import {
  accentBackdrop,
  blendOverlay,
  overlayStrengthFor,
} from '../../../shared/lib/quizAppearance';
import { contrast, PALETTE } from '../../../shared/lib/color';

/**
 * Ajustes propios de UNA pregunta en el formulario. Cada campo ausente es «igual que el general». Un fondo de imagen o
 * de video puede estar a medias (elegido pero sin archivo): no se puede guardar hasta subirlo.
 */
export interface QuestionForm {
  background?:
    | { kind: 'none' }
    | { kind: 'image'; image: ImageRefInput | undefined }
    | { kind: 'video'; video: BackgroundVideo | undefined };
  overlay?: { mode: 'auto' | 'manual'; strength: number };
  accent?: string;
}

/** Estado del formulario de «Apariencia». Todo se guarda explícito: lo que no se toca queda como estaba. */
export interface AppearanceForm {
  /** Ajustes por pregunta, por id estable de la pregunta. */
  questions: Record<string, QuestionForm>;
  kind: 'none' | 'image' | 'video';
  image: ImageRefInput | undefined;
  video: BackgroundVideo | undefined;
  mode: 'auto' | 'manual';
  strength: number;
  accent: AppearanceAccent | undefined;
  cover: ImageRefInput | undefined;
  introHtml: string;
}

/** Lo que el quiz ya muestra hoy (borrador del editor): sirve de punto de partida la primera vez. */
export interface QuizDefaults {
  introHtml: string;
  cover: ImageRefInput | undefined;
}

export const clampStrength = (mode: 'auto' | 'manual', value: number): number =>
  Math.min(OVERLAY_MAX, Math.max(overlayMinimum(mode), Math.round(value * 100) / 100));

/** Formulario a partir de lo guardado; sin apariencia, se rellena con la introducción y la portada actuales del quiz. */
export function formFromAppearance(
  appearance: QuizAppearance | null,
  defaults: QuizDefaults,
): AppearanceForm {
  if (!appearance) {
    return {
      kind: 'none',
      image: undefined,
      video: undefined,
      mode: 'auto',
      strength: OVERLAY_FLOOR,
      accent: undefined,
      cover: defaults.cover,
      introHtml: defaults.introHtml,
      questions: {},
    };
  }
  const background = appearance.background;
  return {
    kind: background?.kind ?? 'none',
    image: background?.kind === 'image' ? background.image : undefined,
    video: background?.kind === 'video' ? background.video : undefined,
    mode: appearance.overlay.mode,
    strength: appearance.overlay.strength,
    accent: appearance.accent,
    // Lo que la apariencia no define, la lectora lo ve del quiz: el formulario lo muestra tal cual.
    cover: appearance.cover ?? defaults.cover,
    introHtml: appearance.introHtml ?? defaults.introHtml,
    questions: Object.fromEntries(
      Object.entries(appearance.questions ?? {}).map(([id, entry]) => [
        id,
        {
          ...(entry.background ? { background: entry.background } : {}),
          ...(entry.overlay ? { overlay: entry.overlay } : {}),
          ...(entry.accent ? { accent: entry.accent } : {}),
        } satisfies QuestionForm,
      ]),
    ),
  };
}

/** Lo que se envía al guardar (siempre introducción y portada explícitas). */
export function toAppearance(form: AppearanceForm): QuizAppearanceInput {
  const background =
    form.kind === 'image' && form.image
      ? ({ kind: 'image', image: form.image } as const)
      : form.kind === 'video' && form.video
        ? ({ kind: 'video', video: form.video } as const)
        : undefined;
  const questions = Object.fromEntries(
    Object.entries(form.questions)
      .map(([id, entry]) => [id, questionToAppearance(entry)] as const)
      .filter(([, entry]) => Object.keys(entry).length > 0),
  );
  return {
    ...(background ? { background } : {}),
    overlay: { mode: form.mode, strength: clampStrength(form.mode, form.strength) },
    ...(form.accent ? { accent: form.accent } : {}),
    ...(form.cover ? { cover: form.cover } : {}),
    introHtml: form.introHtml,
    ...(Object.keys(questions).length > 0 ? { questions } : {}),
  };
}

/**
 * Lo que se envía de una pregunta. Un fondo a medias (sin archivo) no se envía; en modo automático el servidor guarda la
 * intensidad mínima porque el lector la mide con el fondo de ESA pregunta (el valor guardado solo actúa como piso).
 */
function questionToAppearance(
  entry: QuestionForm,
): NonNullable<QuizAppearanceInput['questions']>[string] {
  const background = entry.background;
  return {
    ...(background?.kind === 'none' ? { background: { kind: 'none' as const } } : {}),
    ...(background?.kind === 'image' && background.image
      ? { background: { kind: 'image' as const, image: background.image } }
      : {}),
    ...(background?.kind === 'video' && background.video
      ? { background: { kind: 'video' as const, video: background.video } }
      : {}),
    ...(entry.overlay
      ? {
          overlay: {
            mode: entry.overlay.mode,
            strength:
              entry.overlay.mode === 'auto'
                ? OVERLAY_MIN
                : clampStrength('manual', entry.overlay.strength),
          },
        }
      : {}),
    ...(entry.accent ? { accent: entry.accent } : {}),
  };
}

/** Una pregunta con un fondo elegido pero sin archivo subido todavía: impide guardar. */
export function incompleteQuestions(form: AppearanceForm): string[] {
  return Object.entries(form.questions)
    .filter(
      ([, entry]) =>
        (entry.background?.kind === 'image' && !entry.background.image) ||
        (entry.background?.kind === 'video' && !entry.background.video),
    )
    .map(([id]) => id);
}

/** Cuántos fondos propios de pregunta y cuántos videos hay (el general cuenta como video si lo es). */
export function mediaCounts(form: AppearanceForm): { questionMedia: number; videos: number } {
  const own = Object.values(form.questions).map((entry) => entry.background);
  return {
    questionMedia: own.filter(
      (background) =>
        (background?.kind === 'image' && background.image) ||
        (background?.kind === 'video' && background.video),
    ).length,
    videos:
      (form.kind === 'video' && form.video ? 1 : 0) +
      own.filter((background) => background?.kind === 'video' && background.video).length,
  };
}

export const LIMITS = APPEARANCE_LIMITS;

/** Lo que se ve en una pregunta: el general con los ajustes propios de esa pregunta encima. */
export interface EffectiveForm {
  kind: 'none' | 'image' | 'video';
  image: ImageRefInput | undefined;
  video: BackgroundVideo | undefined;
  mode: 'auto' | 'manual';
  strength: number;
  accent: string | undefined;
}

export function effectiveForm(
  form: AppearanceForm,
  entry: QuestionForm | undefined,
): EffectiveForm {
  const own = entry?.background;
  const background =
    own === undefined
      ? { kind: form.kind, image: form.image, video: form.video }
      : own.kind === 'image'
        ? {
            kind: own.image ? ('image' as const) : ('none' as const),
            image: own.image,
            video: undefined,
          }
        : own.kind === 'video'
          ? {
              kind: own.video ? ('video' as const) : ('none' as const),
              image: undefined,
              video: own.video,
            }
          : { kind: 'none' as const, image: undefined, video: undefined };
  return {
    ...background,
    mode: entry?.overlay?.mode ?? form.mode,
    strength: entry?.overlay?.strength ?? form.strength,
    accent: entry?.accent ?? form.accent,
  };
}

/**
 * Clave estable para saber si hay cambios sin guardar. En modo automático la intensidad la recalcula la medida del
 * fondo, así que no cuenta como un cambio de la persona.
 */
export const formKey = (form: AppearanceForm): string =>
  JSON.stringify(toAppearance(form.mode === 'auto' ? { ...form, strength: OVERLAY_FLOOR } : form));

export const FIELD_LABELS: Record<AppearanceField, string> = {
  background: 'fondo',
  overlay: 'velo',
  accent: 'acento',
  cover: 'portada',
  introHtml: 'introducción',
  questions: 'preguntas',
};

/** Dirección de la imagen que representa el fondo (la propia imagen o el póster del video) para medirla. */
export function sampleSource(form: AppearanceForm): string | undefined {
  if (form.kind === 'image') return form.image?.url;
  if (form.kind === 'video') return form.video?.posterUrl;
  return undefined;
}

export interface ContrastReport {
  /** Texto atenuado sobre el fondo con el velo elegido (≥ 4,5 cumple AA). */
  muted: number;
  /** Texto principal. */
  text: number;
  /** El acento elegido como título grande o borde (≥ 3 cumple). */
  accent: number | undefined;
  /** Con qué se calculó: el color más claro medido o, sin medida, un píxel blanco (el peor caso). */
  basis: 'measured' | 'worst-case';
  ok: boolean;
}

/** Contraste real de lo que verá la lectora con la intensidad elegida. */
export function contrastReport(
  measured: string | undefined,
  strength: number,
  accentHex: string | undefined,
): ContrastReport {
  const backdrop = measured ?? '#ffffff';
  const blended = blendOverlay(backdrop, strength);
  const muted = contrast(PALETTE.muted, blended);
  const text = contrast(PALETTE.text, blended);
  const accent = accentHex ? contrast(accentHex, blended) : undefined;
  return {
    muted,
    text,
    accent,
    basis: measured ? 'measured' : 'worst-case',
    ok: muted >= 4.5 && text >= 4.5 && (accent === undefined || accent >= 3),
  };
}

/** Intensidad que corresponde a un fondo medido (modo automático). Sin medida: el piso, que es seguro. */
export const autoStrength = (measured: string | undefined): number =>
  measured ? overlayStrengthFor(measured) : OVERLAY_FLOOR;

/** Dirección de una miniatura del fondo efectivo (imagen o póster) para medir su zona más clara. */
export function effectiveSampleUrl(eff: EffectiveForm): string | undefined {
  if (eff.kind === 'image' && eff.image) return thumbUrl(eff.image.url, 64);
  if (eff.kind === 'video' && eff.video) return posterUrl(eff.video.posterUrl, 64);
  return undefined;
}

/** Todo lo que se ve (y se garantiza) en una pantalla del quiz, con el general o con los ajustes de una pregunta. */
export interface ScreenModel {
  eff: EffectiveForm;
  /** Intensidad real del velo (0 sin fondo). */
  strength: number;
  /** Fondo ya velado contra el que se lee el acento. */
  accentSurface: string;
  /** Acento tal como se pinta (ajustado si hizo falta), o `undefined` si no hay acento. */
  accent: ReadableAccent | undefined;
  /** Contraste del texto y del acento; `null` sin fondo. */
  report: ContrastReport | null;
}

/**
 * Igual que el lector: el velo automático se mide sobre el fondo de ESA pantalla (hasta medirlo, el piso seguro), el
 * manual vale lo elegido (nunca menos del piso) y el acento se aclara lo mínimo para leerse sobre el fondo ya velado.
 */
export function screenModel(
  form: AppearanceForm,
  entry: QuestionForm | undefined,
  measured: { hex: string | undefined; measuring: boolean },
): ScreenModel {
  const eff = effectiveForm(form, entry);
  const auto = eff.mode === 'auto';
  const strength =
    eff.kind === 'none'
      ? 0
      : auto
        ? measured.measuring
          ? clampStrength('auto', eff.strength)
          : autoStrength(measured.hex)
        : clampStrength('manual', eff.strength);
  const readerMeasured = auto ? measured.hex : undefined;
  const accentSurface = accentBackdrop(eff.kind !== 'none', readerMeasured, strength);
  const accent = eff.accent ? readableAccent(eff.accent, accentSurface) : undefined;
  return {
    eff,
    strength,
    accentSurface,
    accent,
    report: eff.kind === 'none' ? null : contrastReport(readerMeasured, strength, accent?.hex),
  };
}
