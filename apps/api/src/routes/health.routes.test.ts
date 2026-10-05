import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@libro/shared';
import { createTestApp } from '../test-utils/app.js';

describe('GET /api/health', () => {
  it('responde 200 con el estado y la BD arriba', async () => {
    const res = await request(createTestApp({ dbUp: true })).get('/api/health');
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(res.body);
    expect(body.db).toBe('up');
  });

  it('indica db "down" sin tumbar el servicio', async () => {
    const res = await request(createTestApp({ dbUp: false })).get('/api/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(res.body).db).toBe('down');
  });

  it('envía cabeceras de seguridad de helmet y no revela Express', async () => {
    const res = await request(createTestApp()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('CORS', () => {
  it('permite el origen configurado con credenciales', async () => {
    const res = await request(createTestApp())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('no concede acceso a otros orígenes', async () => {
    const res = await request(createTestApp())
      .get('/api/health')
      .set('Origin', 'https://sitio-malicioso.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
