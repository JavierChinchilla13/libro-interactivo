import {
  OVERLAY_FLOOR,
  OVERLAY_MAX,
  OVERLAY_MIN,
  type QuizBackground,
  type QuizOverlay,
  type ReaderAppearance,
  type ReaderQuestionAppearance,
} from '@libro/shared';
import { posterUrl, thumbUrl } from './cloudinary';
import { contrast, PALETTE } from './color';

/** Contraste mínimo (WCAG AA, texto normal) que debe tener el texto atenuado sobre el fondo ya velado. */
const MIN_CONTRAST = 4.5;

const toHex = (channels: number[]): string =>
  `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
const channelsOf = (hex: string): number[] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Color que se ve cuando la capa de contraste (color del fondo del sitio) cubre `backdrop` con esa intensidad. */
export function blendOverlay(backdrop: string, strength: number): string {
  const overlay = channelsOf(PALETTE.bg);
  return toHex(
    channelsOf(backdrop).map((c, i) => c * (1 - strength) + (overlay[i] ?? 0) * strength),
  );
}

/** ¿Se lee el texto atenuado (el más difícil de la paleta) sobre `backdrop` con esa intensidad de velo? */
export function overlayReadable(backdrop: string, strength: number): boolean {
  return contrast(PALETTE.muted, blendOverlay(backdrop, strength)) >= MIN_CONTRAST;
}

/**
 * Intensidad mínima del velo para que el texto se lea sobre `backdrop` (el punto más claro que se midió del fondo):
 * la más baja dentro de [OVERLAY_MIN, OVERLAY_MAX] que cumple AA. Si ni el máximo alcanza, devuelve el máximo.
 */
export function overlayStrengthFor(backdrop: string): number {
  if (overlayReadable(backdrop, OVERLAY_MIN)) return OVERLAY_MIN;
  if (!overlayReadable(backdrop, OVERLAY_MAX)) return OVERLAY_MAX;
  let low = OVERLAY_MIN;
  let high = OVERLAY_MAX;
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    if (overlayReadable(backdrop, mid)) high = mid;
    else low = mid;
  }
  // Se redondea hacia arriba al centésimo: nunca por debajo de lo necesario.
  let rounded = Math.min(OVERLAY_MAX, Math.ceil(high * 100) / 100);
  while (rounded < OVERLAY_MAX && !overlayReadable(backdrop, rounded)) rounded += 0.01;
  return Math.min(OVERLAY_MAX, Math.round(rounded * 100) / 100);
}

/**
 * Intensidad final del velo. `manual` es lo que eligió la autora (nunca por debajo del piso 0,78). `auto` usa la
 * medida del fondo si existe; sin medida (p. ej. el navegador no pudo leer la imagen) cae al piso, que es seguro
 * incluso sobre un píxel blanco.
 */
export function resolveOverlay(
  overlay: { mode: 'auto' | 'manual'; strength: number },
  measuredBackdrop?: string,
): number {
  if (overlay.mode === 'manual') {
    return Math.min(OVERLAY_MAX, Math.max(OVERLAY_FLOOR, overlay.strength));
  }
  if (!measuredBackdrop) return OVERLAY_FLOOR;
  // El valor guardado es la intensidad que midió el editor; si hoy hace falta más, manda lo que hace falta.
  return Math.min(
    OVERLAY_MAX,
    Math.max(OVERLAY_MIN, overlay.strength, overlayStrengthFor(measuredBackdrop)),
  );
}

/**
 * Color contra el que debe leerse el acento: el fondo del quiz ya velado (el punto más claro medido o, sin medida, un
 * píxel blanco: el peor caso) o, sin fondo de quiz, el color liso del sitio.
 */
export function accentBackdrop(
  background: boolean,
  measuredBackdrop: string | undefined,
  strength: number,
): string {
  return background ? blendOverlay(measuredBackdrop ?? '#ffffff', strength) : PALETTE.bg;
}

/** Lo que se ve en una pantalla del quiz una vez resuelto el general con los ajustes de la pregunta. */
export interface EffectiveAppearance {
  background: QuizBackground | undefined;
  overlay: QuizOverlay;
  accent: string | undefined;
}

const DEFAULT_OVERLAY: QuizOverlay = { mode: 'auto', strength: OVERLAY_FLOOR };

/**
 * Apariencia de una pregunta: cada campo que la pregunta no define es el del general; `{kind:'none'}` quita el fondo
 * solo en esa pregunta. Sin apariencia general, valen los valores por defecto (sin fondo, velo automático).
 */
export function effectiveAppearance(
  general: ReaderAppearance | undefined,
  question?: ReaderQuestionAppearance,
): EffectiveAppearance {
  const own = question?.background;
  return {
    background: own === undefined ? general?.background : own.kind === 'none' ? undefined : own,
    overlay: question?.overlay ?? general?.overlay ?? DEFAULT_OVERLAY,
    accent: question?.accent ?? general?.accent,
  };
}

/** Dirección de una miniatura del fondo para medir su zona más clara (la imagen o el póster del video). */
export function backdropSampleUrl(background: QuizBackground | undefined): string | undefined {
  if (background?.kind === 'image') return thumbUrl(background.image.url, 64);
  if (background?.kind === 'video') return posterUrl(background.video.posterUrl, 64);
  return undefined;
}
