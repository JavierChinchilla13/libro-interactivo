import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OVERLAY_MIN } from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { contrast, PALETTE } from '../../shared/lib/color';
import { blendOverlay } from '../../shared/lib/quizAppearance';

const read = (name: string) => {
  const file = [`src/shared/styles/${name}`, `apps/web/src/shared/styles/${name}`]
    .map((path) => resolve(process.cwd(), path))
    .find((path) => existsSync(path));
  if (!file) throw new Error(`No se encontró ${name}`);
  return readFileSync(file, 'utf8');
};
const tokens = read('tokens.css');
const css = read('index.css');

const hex = (name: string) => {
  const match = new RegExp(`--token-${name}:` + String.raw`\s*(#[0-9a-fA-F]{6})\s*;`).exec(tokens);
  if (!match?.[1]) throw new Error(`Falta --token-${name}`);
  return match[1];
};
const mix = (a: string, b: string, weight: number): string => {
  const ch = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [ch(a), ch(b)];
  return `#${x
    .map((c, i) =>
      Math.round(c * weight + (y[i] ?? 0) * (1 - weight))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

describe('barra de acciones del quiz (píldora flotante)', () => {
  it('usa la misma píldora que la barra superior y flota con espacio seguro', () => {
    const rule = /\.quiz-actions\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('position: sticky');
    expect(rule).toContain('env(safe-area-inset-bottom)');
    expect(rule).not.toMatch(/border-radius|background|backdrop/); // los hereda de .nav-pill (tokens)
    expect(/\.nav-pill\s*\{([^}]*)\}/.exec(css)?.[1]).toContain('var(--token-radius-pill)');
  });

  it('sin transparencia (preferencia del sistema) pasa a color sólido', () => {
    expect(css).toMatch(
      /prefers-reduced-transparency: reduce\) \{\s*\.quiz-actions \{[^}]*background: var\(--token-surface\)/,
    );
  });

  it('el texto se lee a más de 9:1 (AAA) sobre el peor fondo: un punto blanco bajo el velo mínimo', () => {
    const glass = Number(
      /--token-glass:\s*color-mix\(in srgb, var\(--token-surface\) (\d+)%/.exec(tokens)?.[1],
    );
    expect(glass).toBeGreaterThan(0);
    const worstBackdrop = blendOverlay('#ffffff', OVERLAY_MIN);
    const pill = mix(hex('surface'), worstBackdrop, glass / 100);
    expect(contrast(PALETTE.text, pill)).toBeGreaterThan(9);
    expect(contrast(PALETTE.muted, pill)).toBeGreaterThanOrEqual(4.5);
    // El botón principal es sólido: su texto no depende del fondo.
    expect(contrast(hex('primary-contrast'), hex('primary'))).toBeGreaterThan(7);
  });
});
