/**
 * Reescribe como #RRGGBB los acentos de apariencia guardados con el nombre de un token. Por defecto solo INFORMA:
 *   npm run migrate:accents -w apps/api
 *   npm run migrate:accents -w apps/api -- --apply     # reescribe (a mano, una persona; haz un respaldo antes)
 * Es idempotente. Leer esos quizzes ya funciona sin correrlo (la lectura traduce los nombres).
 */
import { parseEnv } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { migrateAccents } from '../src/maintenance/migrateAccents.js';

const apply = process.argv.slice(2).includes('--apply');

try {
  const env = parseEnv();
  await connectDb(env.MONGODB_URI);
  const report = await migrateAccents({ apply });
  console.log(
    `${apply ? 'APLICADO' : 'SIMULACIÓN (usa --apply para reescribir)'} · quizzes revisados: ${report.scanned} · con acento con nombre: ${report.withNamedAccent} · acentos con nombre: ${report.namedAccents}${apply ? ` · reescritos: ${report.rewritten}` : ''}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
