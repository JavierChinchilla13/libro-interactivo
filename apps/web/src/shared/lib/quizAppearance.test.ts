import { OVERLAY_FLOOR, OVERLAY_MAX, OVERLAY_MIN, QUICK_ACCENTS } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { contrast, PALETTE } from './color';
import {
  accentBackdrop,
  blendOverlay,
  overlayReadable,
  overlayStrengthFor,
  resolveOverlay,
} from './quizAppearance';

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

describe('acento libre y fondo de lectura', () => {
  it('el fondo contra el que se lee el acento es el fondo velado o, sin fondo, el color liso del sitio', () => {
    expect(accentBackdrop(false, undefined, 0.8)).toBe(PALETTE.bg);
    expect(accentBackdrop(true, undefined, OVERLAY_FLOOR)).toBe(
      blendOverlay('#ffffff', OVERLAY_FLOOR),
    );
    expect(accentBackdrop(true, '#000000', 0.5)).toBe(blendOverlay('#000000', 0.5));
  });

  it('los colores rápidos del editor se leen a 3:1 sobre el peor fondo velado sin necesidad de ajuste', () => {
    const worst = blendOverlay('#ffffff', OVERLAY_FLOOR);
    for (const color of QUICK_ACCENTS) {
      expect(contrast(color.hex, worst), color.name).toBeGreaterThanOrEqual(3);
    }
    // El texto corrido nunca usa el acento: va en texto y texto atenuado, ≥ 4,5:1 con el velo del piso.
    expect(contrast(PALETTE.text, worst)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PALETTE.muted, worst)).toBeGreaterThanOrEqual(4.5);
  });
});
