import { apiErrorSchema, networkCheckResponseSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const url = '/api/admin/network-check';

describe('GET /api/admin/network-check', () => {
  it('solo ADMIN: sin sesión 401, lectora y editora 403', async () => {
    const { app, reader, editor, admin } = await staffWorld();
    expect((await request(app).get(url)).status).toBe(401);
    for (const agent of [reader, editor]) {
      const res = await agent.get(url);
      expect(res.status).toBe(403);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('FORBIDDEN');
    }
    await admin.get(url).expect(200);
  });

  it('describe la cadena de la propia petición, enmascarada y sin caché', async () => {
    const { admin } = await staffWorld({ env: { TRUST_PROXY_HOPS: '1' } });
    const res = await admin
      .get(url)
      .set('X-Forwarded-For', '190.12.34.56, 172.70.1.9')
      .set('CF-Connecting-IP', '190.12.34.56')
      .expect(200);
    const body = networkCheckResponseSchema.parse(res.body);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(body).toMatchObject({
      configuredHops: 1,
      forwardedForEntries: 2,
      hasCfConnectingIp: true,
      cfConnectingIpMasked: '190.12.34.x',
      resolvedMasked: '172.70.1.x',
    });
    // Con 2 saltos aparece la red de la persona, no la del proxy.
    expect(body.candidates[2]).toMatchObject({
      hops: 2,
      masked: '190.12.34.x',
      looksInternal: false,
    });
    expect(body.candidates[0]?.looksInternal).toBe(true); // el socket de la prueba es loopback
    expect(JSON.stringify(res.body)).not.toMatch(/190\.12\.34\.56|172\.70\.1\.9/);
  });

  it('con una cabecera mal formada no la repite ni falla', async () => {
    const { admin } = await staffWorld();
    const res = await admin.get(url).set('X-Forwarded-For', '<b>hola</b>, ???').expect(200);
    expect(JSON.stringify(res.body)).not.toContain('hola');
    expect(networkCheckResponseSchema.parse(res.body).forwardedForEntries).toBe(2);
  });
});
