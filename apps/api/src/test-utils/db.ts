import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { connectDb, disconnectDb } from '../db/connect.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';

/**
 * Registra los hooks de Vitest para usar una MongoDB en memoria: arranca una por archivo de prueba,
 * construye los índices (los únicos son parte de lo que se prueba) y vacía las colecciones entre pruebas.
 */
export function useTestDb(): void {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDb(mongo.getUri());
    await Promise.all([User.init(), RefreshToken.init()]);
  });

  beforeEach(async () => {
    const collections = await mongoose.connection.db?.collections();
    await Promise.all((collections ?? []).map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await disconnectDb();
    await mongo.stop();
  });
}
