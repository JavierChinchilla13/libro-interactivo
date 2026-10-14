import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Se ejecuta desde `apps/web` (npm test -w apps/web) o desde la raíz del monorepo.
const file = ['src/shared/styles/index.css', 'apps/web/src/shared/styles/index.css']
  .map((path) => resolve(process.cwd(), path))
  .find((path) => existsSync(path));
if (!file) throw new Error('No se encontró index.css');
const css = readFileSync(file, 'utf8');

/** Cuerpo del primer bloque `@media (prefers-reduced-motion: reduce) { … }` (con las llaves balanceadas). */
function reducedMotionBlock(): string {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  if (start === -1) throw new Error('Falta el bloque de «reducir movimiento»');
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('Bloque de «reducir movimiento» sin cerrar');
}

describe('«reducir movimiento»', () => {
  it('solo apaga movimiento: ninguna regla cambia el aspecto de los elementos', () => {
    const declarations = [...reducedMotionBlock().matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    const allowed = new Set(['animation', 'transition', 'transform', 'scroll-behavior']);
    const unexpected = declarations.filter((name) => name !== undefined && !allowed.has(name));
    expect(unexpected).toEqual([]);
  });

  it('apaga el punto del revelado, su aro y las transiciones de los controles', () => {
    const block = reducedMotionBlock();
    for (const selector of [
      '.thread-animated .thread-bloom',
      '.reveal-ring',
      '.btn',
      '.option',
      '.meter-fill',
    ]) {
      expect(block, selector).toContain(selector);
    }
  });
});
