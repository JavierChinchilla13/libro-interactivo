/**
 * Diagnóstico de los correos de novedades (SOLO LEE, necesita `MONGODB_URI`): cuántas cuentas hay apuntadas, cuántas de
 * ellas cuenta el aviso «Lo recibirían N lectores apuntados» y por qué falta alguna. Imprime solo conteos, versiones y
 * nombres de índices; nunca correos, nombres, identificadores ni la dirección de conexión.
 *
 *   npm run diagnose:newsletter -w apps/api                    # contra la base de apps/api/.env
 *   MONGODB_URI=… npm run diagnose:newsletter -w apps/api      # contra otra (por ejemplo, una copia restaurada)
 */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { redactUri } from '../src/maintenance/backup.js';
import {
  describeNewsletterDiagnosis,
  diagnoseNewsletter,
} from '../src/maintenance/newsletterDiagnosis.js';

try {
  const uri = process.env['MONGODB_URI'];
  if (!uri) throw new Error('Falta MONGODB_URI en el entorno (por ejemplo en apps/api/.env).');
  await connectDb(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('No se pudo abrir la base de datos.');
  console.log(`Base de datos: ${db.databaseName}`);
  for (const line of describeNewsletterDiagnosis(await diagnoseNewsletter(db))) console.log(line);
} catch (error) {
  console.error(redactUri(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
