/** Utilidades de color (WCAG) para decidir si un color elegido por la autora mantiene el contraste. */

/**
 * Colores de la paleta contra los que se comprueba el tema de un libro. Son los mismos valores de `tokens.css`
 * (una prueba lo verifica, para que no se desfasen).
 */
export const PALETTE = {
  bg: '#06142b',
  surface: '#0b2142',
  text: '#e8f5ff',
  muted: '#9cc2e2',
  primaryContrast: '#04152b',
} as const;

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa de un `#rrggbb`. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** Razón de contraste WCAG entre dos colores `#rrggbb` (de 1 a 21). */
export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

export const isHex = (value: string | undefined): value is string =>
  value !== undefined && /^#[0-9a-fA-F]{6}$/.test(value);

/**
 * ¿Sirve este color como fondo del sitio? El texto y el texto atenuado deben leerse sobre él (≥ 4,5:1) y el color de
 * las tarjetas conservan su propio tono.
 */
export function isUsableBackground(color: string): boolean {
  return (
    isHex(color) && contrast(color, PALETTE.text) >= 4.5 && contrast(color, PALETTE.muted) >= 4.5
  );
}

/**
 * ¿Sirve este color como primario? Se usa como texto y enlace (sobre el fondo y sobre las tarjetas: ≥ 4,5:1) y como
 * fondo de botones con texto oscuro (≥ 4,5:1).
 */
export function isUsablePrimary(color: string, background: string = PALETTE.bg): boolean {
  return (
    isHex(color) &&
    contrast(color, background) >= 4.5 &&
    contrast(color, PALETTE.surface) >= 4.5 &&
    contrast(PALETTE.primaryContrast, color) >= 4.5
  );
}
