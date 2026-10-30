/**
 * Chequeo previo al lanzamiento (SOLO LEE, necesita `MONGODB_URI`): cuánto contenido hay en la base y cuál todavía es de
 * muestra (`[PLACEHOLDER]`, «Libro 1», nombres de ejemplo, correos @ejemplo.com). Imprime títulos y conteos; nunca
 * correos completos ni la dirección de conexión. Sale con código 1 si algo de lo que ve el público es de muestra.
 *
 *   npm run check:prelaunch -w apps/api                       # contra la base de apps/api/.env
 *   MONGODB_URI=… npm run check:prelaunch -w apps/api         # contra otra (por ejemplo, una copia restaurada)
 */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { redactUri } from '../src/maintenance/backup.js';
import { checkPrelaunch, describePrelaunch } from '../src/maintenance/prelaunch.js';

const MARK = { ok: '✓', fail: '✗', warn: '!' } as const;

try {
  const uri = process.env['MONGODB_URI'];
  if (!uri) throw new Error('Falta MONGODB_URI en el entorno (por ejemplo en apps/api/.env).');
  await connectDb(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No se pudo abrir la base de datos.');
  console.log(`Base de datos: ${db.databaseName}`);
  const lines = describePrelaunch(await checkPrelaunch(db));
  for (const line of lines) console.log(`${MARK[line.status]} ${line.text}`);
  const fails = lines.filter((line) => line.status === 'fail').length;
  console.log(
    fails === 0
      ? '\n✓ Nada de muestra a la vista del público.'
      : `\n✗ ${fails} cosa(s) por resolver antes de abrir el sitio.`,
  );
  if (fails > 0) process.exitCode = 1;
} catch (error) {
  console.error(redactUri(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
