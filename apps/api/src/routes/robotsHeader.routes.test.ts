import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../test-utils/app.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

describe('X-Robots-Tag en el API', () => {
  const app = createTestApp();

  it('va en las respuestas correctas, las de error y las de una ruta que no existe', async () => {
    expect((await request(app).get('/api/health')).headers['x-robots-tag']).toBe('noindex');
    expect((await request(app).get('/api/no-existe')).headers['x-robots-tag']).toBe('noindex');
    const invalid = await request(app).post('/api/auth/login').send({});
    expect(invalid.status).toBe(400);
    expect(invalid.headers['x-robots-tag']).toBe('noindex');
  });
});
