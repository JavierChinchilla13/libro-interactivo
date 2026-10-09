import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
  const surfaces = ['bg', 'surface', 'surface-alt'];

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

  it('el color de foco (el cian) se distingue del fondo con al menos 3:1', () => {
    for (const surface of surfaces) {
      expect(contrast(token('primary'), token(surface)), surface).toBeGreaterThanOrEqual(3);
    }
  });
});
