import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiErrorSchema } from '@libro/shared';
import { AppError } from '../lib/errors.js';
import { createTestApp } from '../test-utils/app.js';
import { createRateLimiter } from './rateLimit.js';
import { getInput, validate } from './validate.js';

describe('manejo de errores', () => {
  it('rutas inexistentes devuelven 404 con el formato estándar', async () => {
    const res = await request(createTestApp()).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('AppError usa el estado del código', async () => {
    const app = createTestApp({
      configure: (a) =>
        a.get('/prueba/prohibido', () => {
          throw new AppError('FORBIDDEN', 'No tienes permiso');
        }),
    });
    const res = await request(app).get('/prueba/prohibido');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'FORBIDDEN', message: 'No tienes permiso' } });
  });

  it('un error inesperado responde 500 genérico sin filtrar detalles internos', async () => {
    const app = createTestApp({
      configure: (a) =>
        a.get('/prueba/boom', () => {
          throw new Error('detalle-interno-que-no-debe-salir');
        }),
    });
    const res = await request(app).get('/prueba/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL', message: 'Error interno del servidor' },
    });
    expect(JSON.stringify(res.body)).not.toContain('detalle-interno');
  });

  it('un JSON mal formado responde 400 VALIDATION', async () => {
    const res = await request(createTestApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"roto":');
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION');
  });
});

describe('validate (Zod)', () => {
  const schema = z.object({ nombre: z.string().min(2), edad: z.coerce.number().int().min(0) });
  const app = createTestApp({
    configure: (a) =>
      a.post('/prueba/validar', validate({ body: schema }), (_req, res) => {
        res.json(getInput<z.infer<typeof schema>>(res).body);
      }),
  });

  it('acepta datos válidos y entrega los ya parseados', async () => {
    const res = await request(app).post('/prueba/validar').send({ nombre: 'Ana', edad: '30' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nombre: 'Ana', edad: 30 });
  });

  it('rechaza datos inválidos con 400 VALIDATION', async () => {
    const res = await request(app).post('/prueba/validar').send({ nombre: 'A' });
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION');
  });
});

describe('rate limit', () => {
  it('bloquea con 429 tras superar el límite y usa el formato estándar', async () => {
    const limiter = createRateLimiter({ windowMs: 60_000, limit: 2 });
    const app = express();
    app.use(limiter);
    app.get('/x', (_req, res) => {
      res.json({ ok: true });
    });
    await request(app).get('/x').expect(200);
    await request(app).get('/x').expect(200);
    const res = await request(app).get('/x');
    expect(res.status).toBe(429);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
  });
});
