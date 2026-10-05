/**
 * Levanta un MongoDB local de desarrollo (sin Docker ni instalación) en el puerto 27017,
 * con datos persistentes en apps/api/.data/mongo. Déjalo corriendo en una terminal aparte.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const dbPath = resolve(import.meta.dirname, '../.data/mongo');
mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: { port: 27017, dbPath, storageEngine: 'wiredTiger' },
});
console.log(`MongoDB de desarrollo listo en ${server.getUri()} (datos en ${dbPath})`);

async function stop(): Promise<void> {
  await server.stop();
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
