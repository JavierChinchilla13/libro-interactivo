import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../lib/color';

// Se ejecuta desde `apps/web` (npm test -w apps/web) o desde la raíz del monorepo.
const file = ['src/shared/styles/tokens.css', 'apps/web/src/shared/styles/tokens.css']
  .map((path) => resolve(process.cwd(), path))
  .find((path) => existsSync(path));
if (!file) throw new Error('No se encontró tokens.css');
const css = readFileSync(file, 'utf8');

/**
 * Accesibilidad de la identidad visual: los pares de colores que se usan juntos cumplen WCAG 2.1 AA.
 * Si alguien cambia un token (o el tema de un libro), esta prueba avisa antes de que se rompa la lectura.
 */
const token = (name: string): string => {
  const match = new RegExp(`--token-${name}:` + String.raw`\s*(#[0-9a-fA-F]{6})\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`Falta el token --token-${name} (o no es un color #rrggbb)`);
  return match[1];
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

describe('contraste de la paleta (WCAG AA)', () => {
  const surfaces = ['bg', 'surface', 'surface-alt', 'sunken'];

  it('el texto normal tiene al menos 4.5:1 sobre todos los fondos', () => {
    for (const surface of surfaces) {
      for (const text of ['text', 'muted', 'primary', 'danger', 'success', 'warning', 'accent']) {
        const ratio = contrast(token(text), token(surface));
        // El acento solo se usa sobre fondos de tarjeta, nunca como texto largo.
        if (text === 'accent' && surface === 'surface-alt') continue;
        expect(ratio, `${text} sobre ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('el texto de los botones sobre el cian y sobre el color de peligro tiene al menos 4.5:1', () => {
    expect(contrast(token('primary-contrast'), token('primary'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('primary-contrast'), token('danger'))).toBeGreaterThanOrEqual(4.5);
  });

  it('los bordes de campos y controles tienen al menos 3:1 sobre la tarjeta y el fondo', () => {
    for (const surface of ['bg', 'surface']) {
      expect(contrast(token('border'), token(surface)), surface).toBeGreaterThanOrEqual(3);
    }
  });

  it('el estado «apagado» (bloqueado) se distingue de las superficies con al menos 3:1', () => {
    for (const surface of ['bg', 'surface', 'sunken']) {
      expect(contrast(token('unlit'), token(surface)), surface).toBeGreaterThanOrEqual(3);
    }
  });

  it('el color de foco (el cian) se distingue del fondo con al menos 3:1', () => {
    for (const surface of surfaces) {
      expect(contrast(token('primary'), token(surface)), surface).toBeGreaterThanOrEqual(3);
    }
  });
});

/**
 * Pintura de fondo, velo y vidrio: el texto sigue leyéndose con el peor caso razonable. La pintura del diseñador es
 * muy oscura (el punto más claro medido es ~#0b2b6c); aquí se usa un azul bastante más claro, `#143a85`, como peor caso.
 */
const indexCss = readFileSync(resolve(file, '../index.css'), 'utf8');
const toRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const toHex = (rgb: number[]) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
/** `top` encima de `base` con opacidad `alpha` (0 a 1). */
const over = (top: string, base: string, alpha: number) => {
  const [t, b] = [toRgb(top), toRgb(base)];
  return toHex(t.map((value, i) => value * alpha + (b[i] as number) * (1 - alpha)));
};
/** Porcentaje más bajo de `--token-bg` en el velo de la pintura (`.page-bg::after`): el que menos protege. */
const weakestVeil = (): number => {
  const block = /\.page-bg::after\s*\{[^}]*\}/.exec(indexCss)?.[0] ?? '';
  const values = [...block.matchAll(/--token-bg\) (\d+)%/g)].map((m) => Number(m[1]));
  if (values.length === 0) throw new Error('No se encontró el velo de .page-bg::after');
  return Math.min(...values) / 100;
};
const PAINT_WORST = '#143a85';

describe('contraste sobre la pintura, el velo y el vidrio', () => {
  it('el texto y el texto atenuado se leen sobre la pintura más clara con el velo más débil', () => {
    const veiled = over(token('bg'), PAINT_WORST, weakestVeil());
    expect(contrast(token('text'), veiled), 'text').toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('muted'), veiled), 'muted').toBeGreaterThanOrEqual(4.5);
  });

  it('el texto se lee sobre una carpeta de vidrio puesta sobre esa pintura con velo', () => {
    const veiled = over(token('bg'), PAINT_WORST, weakestVeil());
    const folder = over(token('surface-alt'), veiled, 0.58);
    expect(contrast(token('text'), folder), 'text').toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('muted'), folder), 'muted').toBeGreaterThanOrEqual(4.5);
  });

  it('el velo de la pintura y los tokens nuevos de vidrio y brillo existen', () => {
    expect(css).toMatch(/--token-glass-folder:/);
    expect(css).toMatch(/--token-field-glow:/);
    expect(weakestVeil()).toBeGreaterThan(0);
  });

  it('el texto del título de un campo se lee sobre el velo inferior más fuerte del escenario', () => {
    const base = '#143a85';
    const veiled = over(token('sunken'), base, 0.8);
    expect(contrast(token('text'), veiled)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('la paleta de comprobación del tema por libro', () => {
  it('coincide con los tokens reales (si cambia un token, también cambia shared/lib/color.ts)', () => {
    expect(PALETTE.bg).toBe(token('bg'));
    expect(PALETTE.surface).toBe(token('surface'));
    expect(PALETTE.text).toBe(token('text'));
    expect(PALETTE.muted).toBe(token('muted'));
    expect(PALETTE.primaryContrast).toBe(token('primary-contrast'));
  });
});
