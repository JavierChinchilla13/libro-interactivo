import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDb, disconnectDb, isDbUp } from './connect.js';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

describe('conexión a MongoDB (servidor en memoria)', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDb(mongo.getUri());
  });

  afterAll(async () => {
    await disconnectDb();
    await mongo.stop();
  });

  it('conecta y el health reporta db "up"', async () => {
    expect(isDbUp()).toBe(true);
    const env = parseEnv({ NODE_ENV: 'test' });
    const app = createApp({ env, logger: createLogger(env), isDbUp });
    const res = await request(app).get('/api/health');
    expect(res.body.db).toBe('up');
  });
});
