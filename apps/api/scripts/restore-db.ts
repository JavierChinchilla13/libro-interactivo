/**
 * Restaura un respaldo en una base de PRUEBAS de este equipo, y comprueba que los conteos coinciden con el manifiesto.
 * Se niega a restaurar sobre un servidor remoto (Atlas) o sobre una base cuyo nombre no contenga «prueba», «test» o
 * «local», y a mezclar con datos que ya existan.
 *
 * El respaldo puede ser la carpeta de `backup:db`, un `.tar` con esa carpeta o el `.tar.cifrado` descargado desde el
 * panel (con `--clave`, que pide la contraseña del archivo en pantalla sin mostrarla; nunca se escribe en la línea de
 * comandos). Lo que se extrae va a una carpeta temporal y se borra al terminar.
 *
 *   npm run restore:db -w apps/api -- <respaldo> --a mongodb://127.0.0.1:27017/libro-prueba
 *   npm run restore:db -w apps/api -- <respaldo> --a mongodb://127.0.0.1:27017/libro-prueba --vaciar
 *   npm run restore:db -w apps/api -- <respaldo> --solo-verificar     # no toca ninguna base
 *   npm run restore:db -w apps/api -- <archivo>.tar.cifrado --clave --solo-verificar
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
import { openBackupSource, type OpenedBackup } from '../src/maintenance/backupArchive.js';
import { askArchiveKey, parseRestoreArgs } from '../src/maintenance/restoreCli.js';

let opened: OpenedBackup | undefined;
try {
  const args = parseRestoreArgs(process.argv.slice(2));
  if (!args.verifyOnly) {
    if (!args.target) {
      throw new Error('Indica la base de destino con --a mongodb://127.0.0.1:27017/libro-prueba');
    }
    assertSafeRestoreTarget(args.target);
  }
  opened = await openBackupSource(resolve(args.source), {
    askPassword: args.askKey
      ? () => askArchiveKey({ input: process.stdin, output: process.stdout }, process.env)
      : undefined,
  });
  if (opened.kind === 'encrypted')
    console.log('✓ Archivo descifrado: la contraseña es correcta y no fue alterado.');
  if (opened.kind !== 'folder')
    console.log('✓ Archivo extraído en una carpeta temporal (se borra al terminar).');

  if (args.verifyOnly) {
    const { manifest, problems } = await verifyBackup(opened.folder);
    console.log(`Respaldo de «${manifest.database}» del ${manifest.createdAt}`);
    for (const entry of manifest.collections)
      console.log(`- ${entry.name}: ${entry.count} documentos`);
    if (problems.length > 0) {
      for (const item of problems) console.error(`✗ ${item.collection}: ${item.problem}`);
      throw new Error('El respaldo tiene problemas.');
    }
    console.log('✓ El respaldo está completo: huellas y conteos coinciden.');
  } else {
    await connectDb(args.target ?? '');
    const db = mongoose.connection.db;
    if (!db) throw new Error('No se pudo abrir la base de destino.');
    const report = await restoreDatabase(db, opened.folder, { empty: args.empty });
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
  await opened?.cleanup();
  await disconnectDb();
}
