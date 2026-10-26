import { OVERLAY_FLOOR, OVERLAY_MIN } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { accentCss, ACCENT_MIN_CONTRAST, readableAccent } from './accent';
import { contrast, PALETTE } from './color';
import { blendOverlay } from './quizAppearance';

const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
};

describe('readableAccent', () => {
  const dark = blendOverlay('#ffffff', OVERLAY_FLOOR); // el peor fondo velado en manual / sin medir
  const bright = blendOverlay('#ffffff', OVERLAY_MIN); // el más claro posible (automático al mínimo)

  it('no toca un color que ya se lee', () => {
    for (const hex of ['#3fd8ff', '#a89bff', '#5fe3ae', '#ffcb66', '#F2EAD8']) {
      const result = readableAccent(hex, dark);
      expect(result.adjusted, hex).toBe(false);
      expect(result.hex).toBe(hex.toLowerCase());
      expect(result.ratio).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
    }
  });

  it('aclara lo mínimo un color oscuro sobre fondo oscuro, conservando el tono, y queda a 3:1 o más', () => {
    const result = readableAccent('#1a3a6e', PALETTE.bg);
    expect(result.adjusted).toBe(true);
    expect(contrast(result.hex, PALETTE.bg)).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
    expect(Math.abs(hue(result.hex) - hue('#1a3a6e'))).toBeLessThan(4);
    // Mínimo: un paso más oscuro ya no cumpliría.
    const slightlyDarker = readableAccent(result.hex, PALETTE.bg, 3);
    expect(slightlyDarker.adjusted).toBe(false);
  });

  it('el ajuste es mínimo: queda justo en el borde de 3:1, sin pasarse', () => {
    for (const hex of ['#2a4f8f', '#1f3d73', '#142a52', '#0b1a35', '#401020']) {
      const result = readableAccent(hex, PALETTE.bg);
      expect(result.adjusted, hex).toBe(true);
      expect(result.ratio, hex).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
      expect(result.ratio, hex).toBeLessThan(ACCENT_MIN_CONTRAST + 0.15);
    }
  });

  it('el resultado siempre cumple 3:1 sobre cualquier fondo velado alcanzable, con cualquier color', () => {
    const backdrops = [
      PALETTE.bg,
      dark,
      bright,
      blendOverlay('#808080', 0.6),
      blendOverlay('#ffcc00', 0.7),
    ];
    const colors = [
      '#000000',
      '#ffffff',
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#808080',
      '#123456',
      '#fedcba',
      '#a89bff',
      '#3fd8ff',
    ];
    for (const backdrop of backdrops) {
      for (const color of colors) {
        const result = readableAccent(color, backdrop);
        expect(result.hex).toMatch(/^#[0-9a-f]{6}$/);
        expect(result.ratio, `${color} sobre ${backdrop}`).toBeGreaterThanOrEqual(
          ACCENT_MIN_CONTRAST,
        );
      }
    }
  });

  it('sobre un fondo claro oscurece el color en vez de aclararlo', () => {
    const result = readableAccent('#f2ead8', '#ffffff');
    expect(result.adjusted).toBe(true);
    expect(contrast(result.hex, '#ffffff')).toBeGreaterThanOrEqual(ACCENT_MIN_CONTRAST);
  });

  it('con un valor que no es un hex no revienta: devuelve un hex válido', () => {
    expect(readableAccent('rojo', dark).hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('accentCss (nada sin validar llega al CSS)', () => {
  it('solo deja pasar #RRGGBB', () => {
    expect(accentCss('#A89BFF')).toBe('#a89bff');
    for (const bad of [
      'red',
      'var(--x)',
      '#fff',
      'url(x)',
      '#ff0000;color:red',
      '',
      undefined,
      null,
      5,
    ]) {
      expect(accentCss(bad), String(bad)).toBeUndefined();
    }
  });
});
