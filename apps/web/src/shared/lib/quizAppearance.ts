import { OVERLAY_FLOOR, OVERLAY_MAX, OVERLAY_MIN, type AppearanceAccent } from '@libro/shared';
import { contrast, PALETTE } from './color';

/** Contraste mínimo (WCAG AA, texto normal) que debe tener el texto atenuado sobre el fondo ya velado. */
const MIN_CONTRAST = 4.5;

/** Color del acento de la apariencia: siempre un token del sitio, nunca un color libre. */
export function accentVar(accent: AppearanceAccent | undefined): string {
  return `var(--token-${accent ?? 'primary'})`;
}

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
