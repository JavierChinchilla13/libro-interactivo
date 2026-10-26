import { HEX_COLOR } from '@libro/shared';
import { contrast } from './color';

/** Contraste mínimo del acento (títulos grandes, bordes y controles) contra el fondo ya velado: WCAG 3:1. */
export const ACCENT_MIN_CONTRAST = 3;

type Hsl = [number, number, number];

function hexToHsl(hex: string): Hsl {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex([h, s, l]: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Lo que devuelve `readableAccent`: el color a pintar y si hubo que ajustarlo. */
export interface ReadableAccent {
  /** Color a pintar (`#rrggbb` en minúsculas). */
  hex: string;
  /** `true` si se cambió la claridad del color elegido para que se lea. */
  adjusted: boolean;
  /** Contraste del color a pintar contra el fondo dado. */
  ratio: number;
}

/**
 * Garantiza que el acento se lea (por defecto 3:1) contra el fondo ya velado. Si el color elegido ya cumple, no se
 * toca. Si no, se mueve SOLO su claridad (el tono y la saturación se conservan) lo mínimo posible, hacia lo más claro
 * o lo más oscuro según cuál cumpla con menos cambio. Si ni el extremo cumple (fondo de tono medio), se devuelve el
 * extremo que más contraste da. Siempre devuelve un `#rrggbb` válido.
 */
export function readableAccent(
  accent: string,
  backdrop: string,
  min: number = ACCENT_MIN_CONTRAST,
): ReadableAccent {
  const chosen = HEX_COLOR.test(accent) ? accent.toLowerCase() : '#ffffff';
  const original = contrast(chosen, backdrop);
  if (original >= min) return { hex: chosen, adjusted: false, ratio: original };

  const [h, s, l] = hexToHsl(chosen);
  const toward = (target: 0 | 1) => {
    const extreme = hslToHex([h, s, target]);
    if (contrast(extreme, backdrop) < min)
      return { hex: extreme, reached: false, move: Math.abs(target - l) };
    let failing = l;
    let passing: number = target;
    for (let step = 0; step < 30; step += 1) {
      const mid = (failing + passing) / 2;
      if (contrast(hslToHex([h, s, mid]), backdrop) >= min) passing = mid;
      else failing = mid;
    }
    // El redondeo a 8 bits puede dejarlo por debajo: se empuja un poco más hacia el extremo.
    let at = passing;
    while (contrast(hslToHex([h, s, at]), backdrop) < min && at !== target) {
      at = target === 1 ? Math.min(1, at + 0.002) : Math.max(0, at - 0.002);
    }
    return { hex: hslToHex([h, s, at]), reached: true, move: Math.abs(at - l) };
  };
  const lighter = toward(1);
  const darker = toward(0);
  const options = [lighter, darker];
  const reached = options.filter((option) => option.reached);
  const best =
    reached.length > 0
      ? reached.reduce((a, b) => (b.move < a.move ? b : a))
      : options.reduce((a, b) => (contrast(b.hex, backdrop) > contrast(a.hex, backdrop) ? b : a));
  return { hex: best.hex, adjusted: best.hex !== chosen, ratio: contrast(best.hex, backdrop) };
}

/** `#rrggbb` listo para CSS, o `undefined` si no es un hex válido (nada sin validar llega a una hoja de estilos). */
export function accentCss(accent: unknown): string | undefined {
  return typeof accent === 'string' && HEX_COLOR.test(accent) ? accent.toLowerCase() : undefined;
}
