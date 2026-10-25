import {
  OVERLAY_MAX,
  overlayMinimum,
  type AppearanceAccent,
  type AppearanceField,
  type BackgroundVideo,
  type ImageRefInput,
  type QuizAppearance,
  type QuizAppearanceInput,
} from '@libro/shared';
import { OVERLAY_FLOOR } from '@libro/shared';
import { blendOverlay, overlayStrengthFor } from '../../../shared/lib/quizAppearance';
import { contrast, PALETTE } from '../../../shared/lib/color';

/** Estado del formulario de «Apariencia». Todo se guarda explícito: lo que no se toca queda como estaba. */
export interface AppearanceForm {
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
  return {
    ...(background ? { background } : {}),
    overlay: { mode: form.mode, strength: clampStrength(form.mode, form.strength) },
    ...(form.accent ? { accent: form.accent } : {}),
    ...(form.cover ? { cover: form.cover } : {}),
    introHtml: form.introHtml,
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
