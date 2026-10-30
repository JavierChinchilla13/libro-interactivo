/**
 * Imprime la cabecera `Content-Security-Policy-Report-Only` lista para pegar en `render.yaml` (y en el Dashboard de
 * Render), calculando las huellas de los scripts en línea del `index.html` YA COMPILADO.
 *
 *   npm run build -w apps/web && npm run csp:print
 *
 * Cada vez que cambie un script en línea de `index.html` hay que volver a correrlo y actualizar `render.yaml`; la prueba
 * `vite/csp.test.ts` falla si la copia de `render.yaml` ya no coincide.
 */
/* eslint-disable no-console -- guion de línea de comandos */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCsp, inlineScriptHashes } from '../vite/csp.ts';

const dist = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist/index.html');
if (!existsSync(dist)) {
  console.error('Primero compila el sitio: npm run build -w apps/web');
  process.exitCode = 1;
} else {
  const hashes = inlineScriptHashes(readFileSync(dist, 'utf8'));
  console.log(`Scripts en línea encontrados: ${hashes.length}\n`);
  console.log(buildCsp(hashes));
}
