/**
 * Restaura un respaldo en una base de PRUEBAS de este equipo, y comprueba que los conteos coinciden con el manifiesto.
 * Se niega a restaurar sobre un servidor remoto (Atlas) o sobre una base cuyo nombre no contenga «prueba», «test» o
 * «local», y a mezclar con datos que ya existan.
 *
 *   npm run restore:db -w apps/api -- <carpeta-del-respaldo> --a mongodb://127.0.0.1:27017/libro-prueba
 *   npm run restore:db -w apps/api -- <carpeta-del-respaldo> --a mongodb://127.0.0.1:27017/libro-prueba --vaciar
 *   npm run restore:db -w apps/api -- <carpeta-del-respaldo> --solo-verificar     # no toca ninguna base
 *
 * Para probar el respaldo de verdad: restaurar, abrir el API local contra esa base (MONGODB_URI=… npm run dev -w
 * apps/api) y entrar con una cuenta.
 */
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import {
  assertSafeRestoreTarget,
  redactUri,
  restoreDatabase,
  verifyBackup,
} from '../src/maintenance/backup.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const folder = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--a');

try {
  if (!folder) throw new Error('Indica la carpeta del respaldo (la que tiene manifiesto.json).');
  const source = resolve(folder);

  if (flag('--solo-verificar')) {
    const { manifest, problems } = await verifyBackup(source);
    console.log(`Respaldo de «${manifest.database}» del ${manifest.createdAt}`);
    for (const entry of manifest.collections)
      console.log(`- ${entry.name}: ${entry.count} documentos`);
    if (problems.length > 0) {
      for (const item of problems) console.error(`✗ ${item.collection}: ${item.problem}`);
      throw new Error('El respaldo tiene problemas.');
    }
    console.log('✓ El respaldo está completo: huellas y conteos coinciden.');
  } else {
    const target = value('--a');
    if (!target)
      throw new Error('Indica la base de destino con --a mongodb://127.0.0.1:27017/libro-prueba');
    assertSafeRestoreTarget(target);
    await connectDb(target);
    const db = mongoose.connection.db;
    if (!db) throw new Error('No se pudo abrir la base de destino.');
    const report = await restoreDatabase(db, source, { empty: flag('--vaciar') });
    console.log(`Base de destino: ${report.database}`);
    for (const item of report.restored) {
      console.log(`${item.ok ? '✓' : '✗'} ${item.name}: ${item.actual} de ${item.expected}`);
    }
    if (!report.ok) throw new Error('Algún conteo no coincide con el manifiesto.');
    console.log('✓ Restauración completa: todos los conteos coinciden con el manifiesto.');
  }
} catch (error) {
  console.error(redactUri(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
