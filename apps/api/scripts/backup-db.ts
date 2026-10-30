/**
 * Respaldo de la base de datos (solo LEE; no escribe nada en la base). Lee `MONGODB_URI` del entorno y guarda cada
 * colección en un archivo `.ndjson.gz` dentro de una carpeta nueva fuera del repositorio, con un `manifiesto.json`
 * (conteos, huellas SHA-256 e índices). Nunca imprime ni guarda la dirección de conexión.
 *
 *   npm run backup:db -w apps/api
 *   npm run backup:db -w apps/api -- --salida D:\respaldos          # otra carpeta base (fuera del repositorio)
 *   npm run backup:db -w apps/api -- --con-sesiones                  # incluye sesiones y enlaces de recuperación
 *
 * El respaldo trae datos personales y huellas de contraseñas: guárdalo como un secreto (disco cifrado o gestor de
 * archivos privado), nunca en el repositorio ni en un chat. No incluye `ACCESS_TOKEN_SECRET` ni lo de Cloudinary/R2.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import {
  assertOutsideRepo,
  backupFolderName,
  exportDatabase,
  redactUri,
} from '../src/maintenance/backup.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

try {
  const uri = process.env['MONGODB_URI'];
  if (!uri) throw new Error('Falta MONGODB_URI en el entorno (por ejemplo en apps/api/.env).');
  const base = resolve(value('--salida') ?? resolve(repoRoot, '..', 'libro-interactivo-respaldos'));
  const folder = resolve(base, backupFolderName(new Date()));
  assertOutsideRepo(folder, repoRoot);

  await connectDb(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No se pudo abrir la base de datos.');
  const manifest = await exportDatabase(db, folder, new Date(), {
    includeSessions: flag('--con-sesiones'),
  });

  console.log(`Base de datos: ${manifest.database}`);
  for (const entry of manifest.collections) {
    console.log(`- ${entry.name}: ${entry.count} documentos (${entry.bytes} bytes comprimidos)`);
  }
  const total = manifest.collections.reduce((sum, entry) => sum + entry.count, 0);
  if (manifest.excluded.length > 0)
    console.log(`No incluido a propósito: ${manifest.excluded.join(', ')}`);
  console.log(`Total: ${total} documentos en ${manifest.collections.length} colecciones.`);
  console.log(`Respaldo guardado en: ${folder}`);
} catch (error) {
  console.error(redactUri(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
