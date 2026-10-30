/**
 * Comprobación de humo del sitio publicado (SOLO LEE). Imprime ✓ / ✗ / ! por comprobación y sale con código 1 si algo
 * falla (los avisos «!» no cuentan).
 *
 *   npm run smoke:prod -w apps/api -- https://universomemorias.com              # sitio cerrado a buscadores (lo normal)
 *   npm run smoke:prod -w apps/api -- https://universomemorias.com --indexable   # tras abrir el sitio al público
 *   npm run smoke:prod -w apps/api -- http://localhost:5173 --sin-www            # contra una copia local
 *
 * Para comprobar que el límite de intentos cuenta por persona (IP real), córrelo desde dos redes (wifi y datos del
 * celular) en la misma hora: el contador `RateLimit` del ingreso falso debe empezar de nuevo en la segunda red.
 */
import { formatSmoke, runSmoke } from '../src/maintenance/smoke.js';

const args = process.argv.slice(2);
const baseUrl = args.find((arg) => !arg.startsWith('--'));

try {
  if (!baseUrl)
    throw new Error('Indica la dirección del sitio, por ejemplo https://universomemorias.com');
  const checks = await runSmoke({
    baseUrl,
    mode: args.includes('--indexable') ? 'indexable' : 'noindex',
    checkWww: !args.includes('--sin-www'),
  });
  console.log(formatSmoke(checks));
  if (checks.some((check) => check.status === 'fail')) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
