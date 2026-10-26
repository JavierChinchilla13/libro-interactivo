import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'panelVisuals.css'), 'utf8');
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No existe la regla ${selector}`);
  return css.slice(start, css.indexOf('}', start));
};

describe('imagen de ambiente del saludo (panelVisuals.css)', () => {
  const ambient = rule('.greeting-ambient');

  it('se desvanece por los cuatro lados, sin borde duro', () => {
    for (const property of ['mask-image', '-webkit-mask-image']) {
      const line = ambient.slice(ambient.indexOf(property));
      expect(line).toContain('to bottom');
      expect(line).toContain('to right');
    }
    expect(ambient).toContain('mask-composite: intersect');
    expect(ambient).toContain('-webkit-mask-composite: source-in');
    expect(ambient).not.toMatch(/border-radius/);
  });

  it('cubre solo el bloque del saludo: no se sale por arriba hacia la barra ni baja a «Tus libros»', () => {
    expect(ambient).toMatch(/inset:\s*0\s+-1rem/);
    expect(ambient).not.toMatch(/inset:\s*-/);
    expect(ambient).not.toMatch(/height:\s*14rem/);
  });

  it('el bloque del saludo deja aire arriba y abajo para la imagen', () => {
    const header = rule('.greeting-block');
    expect(header).toMatch(/padding-block:\s*1rem\s+2rem/);
  });
});
