import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APPEARANCE_ACCENTS, OVERLAY_FLOOR, OVERLAY_MAX, OVERLAY_MIN } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { contrast, PALETTE } from './color';
import {
  accentVar,
  blendOverlay,
  overlayReadable,
  overlayStrengthFor,
  resolveOverlay,
} from './quizAppearance';

const file = ['src/shared/styles/tokens.css', 'apps/web/src/shared/styles/tokens.css']
  .map((path) => resolve(process.cwd(), path))
  .find((path) => existsSync(path));
if (!file) throw new Error('No se encontró tokens.css');
const css = readFileSync(file, 'utf8');
const token = (name: string): string => {
  const match = new RegExp(`--token-${name}:` + String.raw`\s*(#[0-9a-fA-F]{6})\s*;`).exec(css);
  if (!match?.[1]) throw new Error(`Falta --token-${name}`);
  return match[1];
};

describe('blendOverlay', () => {
  it('con intensidad 0 deja el fondo y con 1 queda el color del sitio', () => {
    expect(blendOverlay('#ffffff', 0)).toBe('#ffffff');
    expect(blendOverlay('#ffffff', 1)).toBe(PALETTE.bg);
  });
});

describe('overlayStrengthFor', () => {
  it('un fondo oscuro necesita el mínimo; uno blanco necesita más, sin pasar del piso', () => {
    expect(overlayStrengthFor('#000000')).toBe(OVERLAY_MIN);
    const white = overlayStrengthFor('#ffffff');
    expect(white).toBeGreaterThan(OVERLAY_MIN);
    expect(white).toBeLessThanOrEqual(OVERLAY_FLOOR);
  });

  it('el valor devuelto cumple AA y un centésimo menos no (es el mínimo)', () => {
    for (const backdrop of ['#ffffff', '#c8d2e0', '#808080', '#ffd966', '#40a0ff', '#202020']) {
      const strength = overlayStrengthFor(backdrop);
      expect(overlayReadable(backdrop, strength), backdrop).toBe(true);
      if (strength > OVERLAY_MIN) {
        expect(overlayReadable(backdrop, strength - 0.011), backdrop).toBe(false);
      }
    }
  });

  it('crece de forma monótona con la claridad del fondo', () => {
    const levels = [0, 64, 128, 192, 255].map((v) =>
      overlayStrengthFor(`#${v.toString(16).padStart(2, '0').repeat(3)}`),
    );
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });
});

describe('resolveOverlay', () => {
  it('manual nunca baja del piso ni pasa del máximo', () => {
    expect(resolveOverlay({ mode: 'manual', strength: 0.5 })).toBe(OVERLAY_FLOOR);
    expect(resolveOverlay({ mode: 'manual', strength: 0.85 })).toBe(0.85);
    expect(resolveOverlay({ mode: 'manual', strength: 0.99 })).toBe(OVERLAY_MAX);
  });

  it('auto sin medida cae al piso, que se lee incluso sobre un píxel blanco', () => {
    expect(resolveOverlay({ mode: 'auto', strength: 0.6 })).toBe(OVERLAY_FLOOR);
    expect(overlayReadable('#ffffff', OVERLAY_FLOOR)).toBe(true);
  });

  it('auto con medida usa lo guardado, pero sube si hoy hace falta más', () => {
    expect(resolveOverlay({ mode: 'auto', strength: 0.6 }, '#000000')).toBe(0.6);
    expect(resolveOverlay({ mode: 'auto', strength: 0.5 }, '#ffffff')).toBe(
      overlayStrengthFor('#ffffff'),
    );
  });
});

describe('acentos de la apariencia', () => {
  it('cada acento permitido es un token del sitio', () => {
    for (const accent of APPEARANCE_ACCENTS) {
      expect(accentVar(accent)).toBe(`var(--token-${accent})`);
      expect(css).toContain(`--token-${accent}:`);
    }
    expect(accentVar(undefined)).toBe('var(--token-primary)');
  });

  it('cada acento cumple 3:1 (títulos grandes, bordes y controles) sobre el peor fondo posible con el velo del piso', () => {
    // El texto corrido nunca usa el acento: va en --token-text / --token-muted (≥ 4,5:1 con el velo del piso).
    const worst = blendOverlay('#ffffff', OVERLAY_FLOOR);
    for (const accent of APPEARANCE_ACCENTS) {
      expect(contrast(token(accent), worst), accent).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(PALETTE.text, worst)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.muted, worst)).toBeGreaterThanOrEqual(4.5);
  });
});
