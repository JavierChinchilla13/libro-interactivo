/**
 * Reconstruye el avance (`userProgress`) a partir de los intentos completados. Por defecto solo INFORMA (no escribe):
 *   npm run repair:progress -w apps/api
 *   npm run repair:progress -w apps/api -- --apply            # escribe los cambios (idempotente)
 *   npm run repair:progress -w apps/api -- --user <id>        # solo una persona
 * Conviene hacer un respaldo de la base antes de usar `--apply` en producción.
 */
import { parseEnv } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { repairProgress } from '../src/maintenance/repairProgress.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const userIndex = args.indexOf('--user');
const userId = userIndex >= 0 ? args[userIndex + 1] : undefined;

try {
  const env = parseEnv();
  await connectDb(env.MONGODB_URI);
  const report = await repairProgress({ apply, ...(userId ? { userId } : {}) });
  console.log(
    `${apply ? 'APLICADO' : 'SIMULACIÓN (usa --apply para escribir)'} · avances revisados: ${report.scanned} · con diferencias: ${report.entries.length}`,
  );
  for (const entry of report.entries) {
    const parts = [
      entry.missingQuizIds.length > 0 ? `faltan ${entry.missingQuizIds.length} quiz(zes)` : '',
      entry.staleQuizIds.length > 0
        ? `${entry.staleQuizIds.length} resultado(s) vigente(s) desactualizado(s)`
        : '',
      entry.bookCompletedAt ? `libro completado el ${entry.bookCompletedAt}` : '',
      entry.orphanQuizIds.length > 0
        ? `${entry.orphanQuizIds.length} entrada(s) sin intento (no se borran)`
        : '',
    ].filter(Boolean);
    console.log(`- persona ${entry.userId} · libro ${entry.bookId}: ${parts.join('; ')}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
