import { apiErrorSchema, networkCheckResponseSchema } from '@libro/shared';
import type { Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import { staffWorld } from '../test-utils/admin.js';
import { createTestApp } from '../test-utils/app.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const MINUTE = 60_000;
const body = { email: 'nadie@ejemplo.com', password: 'x-clave-123' };
/** Lo que se midió en producción: la cadena interna de Render es parecida en todas las peticiones. */
const INTERNAL_CHAIN = '172.71.1.5, 172.71.1.5, 10.29.1.7, 10.29.1.8';

interface AppOptions {
  trustCloudflare?: boolean;
  hops?: number;
}
function appWith({ trustCloudflare = true, hops = 1 }: AppOptions = {}) {
  return createTestApp({
    env: {
      TRUST_CLOUDFLARE_HEADER: String(trustCloudflare),
      TRUST_PROXY_HOPS: String(hops),
    },
    limits: { login: { windowMs: MINUTE, limit: 2 } },
    configure: (app) => {
      app.get('/_ip', (req, res) => {
        res.json({ ip: req.ip });
      });
    },
  });
}
const ipSeenBy = async (app: Express, headers: Record<string, string | string[]> = {}) => {
  const req = request(app).get('/_ip');
  // Node envía una línea de cabecera por elemento del arreglo (la cabecera repetida); los tipos solo conocen texto.
  for (const [name, value] of Object.entries(headers)) req.set(name, value as string);
  return (await req.expect(200)).body.ip as string;
};
const loginFrom = (app: Express, cf: string | undefined, forwardedFor = INTERNAL_CHAIN) => {
  const req = request(app).post('/api/auth/login').set('X-Forwarded-For', forwardedFor);
  if (cf !== undefined) req.set('CF-Connecting-IP', cf);
  return req.send(body);
};

describe('TRUST_CLOUDFLARE_HEADER', () => {
  it('por defecto apagada; acepta true/false y rechaza otros valores', () => {
    expect(parseEnv({ NODE_ENV: 'test' }).TRUST_CLOUDFLARE_HEADER).toBe(false);
    expect(
      parseEnv({ NODE_ENV: 'test', TRUST_CLOUDFLARE_HEADER: 'true' }).TRUST_CLOUDFLARE_HEADER,
    ).toBe(true);
    expect(() => parseEnv({ NODE_ENV: 'test', TRUST_CLOUDFLARE_HEADER: 'si' })).toThrow(
      /TRUST_CLOUDFLARE_HEADER/,
    );
  });
});

describe('IP resuelta con la cabecera de Cloudflare', () => {
  it('encendida y válida: manda sobre X-Forwarded-For y los saltos (IPv4, IPv6 y con espacios)', async () => {
    const app = appWith();
    const xff = { 'X-Forwarded-For': INTERNAL_CHAIN };
    expect(await ipSeenBy(app, { ...xff, 'CF-Connecting-IP': '203.0.113.7' })).toBe('203.0.113.7');
    expect(await ipSeenBy(app, { ...xff, 'CF-Connecting-IP': ' 203.0.113.7 ' })).toBe(
      '203.0.113.7',
    );
    expect(await ipSeenBy(app, { ...xff, 'CF-Connecting-IP': '2800:4f0:1a2::9' })).toBe(
      '2800:4f0:1a2::9',
    );
  });

  it('ausente: se usa la resolución por saltos', async () => {
    const app = appWith({ hops: 1 });
    expect(await ipSeenBy(app, { 'X-Forwarded-For': INTERNAL_CHAIN })).toBe('10.29.1.8');
  });

  it.each([
    ['texto', 'no-es-una-ip'],
    ['IPv4 fuera de rango', '999.1.1.1'],
    ['dos direcciones', '203.0.113.7, 198.51.100.1'],
    ['con zona IPv6', 'fe80::1%eth0'],
    ['con puerto', '203.0.113.7:443'],
    ['código', '<script>1</script>'],
  ])('inválida (%s): se ignora y rige TRUST_PROXY_HOPS', async (_label, value) => {
    const app = appWith({ hops: 1 });
    expect(
      await ipSeenBy(app, { 'X-Forwarded-For': INTERNAL_CHAIN, 'CF-Connecting-IP': value }),
    ).toBe('10.29.1.8');
  });

  it('repetida (dos líneas de cabecera): no es una IP, se ignora', async () => {
    const app = appWith({ hops: 1 });
    expect(
      await ipSeenBy(app, {
        'X-Forwarded-For': INTERNAL_CHAIN,
        'CF-Connecting-IP': ['203.0.113.7', '198.51.100.1'],
      }),
    ).toBe('10.29.1.8');
  });

  it('apagada: la cabecera se ignora por completo, aunque sea válida', async () => {
    const app = appWith({ trustCloudflare: false, hops: 1 });
    expect(
      await ipSeenBy(app, { 'X-Forwarded-For': INTERNAL_CHAIN, 'CF-Connecting-IP': '203.0.113.7' }),
    ).toBe('10.29.1.8');
  });

  it('falsificada junto a X-Forwarded-For: lo que se antepone en X-Forwarded-For no cambia nada', async () => {
    const app = appWith();
    const real = { 'CF-Connecting-IP': '203.0.113.7' };
    const a = await ipSeenBy(app, { ...real, 'X-Forwarded-For': `9.9.9.9, ${INTERNAL_CHAIN}` });
    const b = await ipSeenBy(app, { ...real, 'X-Forwarded-For': `8.8.8.8, ${INTERNAL_CHAIN}` });
    expect(a).toBe('203.0.113.7');
    expect(b).toBe('203.0.113.7');
  });
});

describe('el limitador de ingreso con la cabecera de Cloudflare', () => {
  it('dos CF-Connecting-IP distintas con la misma cadena interna tienen contadores distintos', async () => {
    const app = appWith();
    for (let i = 0; i < 2; i += 1) expect((await loginFrom(app, '203.0.113.7')).status).toBe(401);
    const blocked = await loginFrom(app, '203.0.113.7');
    expect(blocked.status).toBe(429);
    expect(apiErrorSchema.parse(blocked.body).error.code).toBe('RATE_LIMITED');
    // Otra lectora, misma cadena interna de Render: su propio contador.
    expect((await loginFrom(app, '198.51.100.9')).status).toBe(401);
    expect((await loginFrom(app, '198.51.100.9')).status).toBe(401);
    expect((await loginFrom(app, '198.51.100.9')).status).toBe(429);
  });

  it('la misma CF-Connecting-IP comparte contador aunque cambie la cadena de X-Forwarded-For', async () => {
    const app = appWith();
    await loginFrom(app, '203.0.113.7', '1.1.1.1, 10.29.1.7').expect(401);
    await loginFrom(app, '203.0.113.7', '2.2.2.2, 10.31.4.4').expect(401);
    expect((await loginFrom(app, '203.0.113.7', '3.3.3.3, 10.29.9.9')).status).toBe(429);
  });

  it('sin la cabecera o con una inválida cae al contador por saltos', async () => {
    const app = appWith({ hops: 1 });
    // Sin cabecera: todos terminan en la misma entrada interna, un solo contador.
    await loginFrom(app, undefined).expect(401);
    await loginFrom(app, 'no-es-ip').expect(401);
    expect((await loginFrom(app, '203.0.113.7, 198.51.100.1')).status).toBe(429);
    // Una CF válida sigue teniendo su propio contador.
    expect((await loginFrom(app, '203.0.113.7')).status).toBe(401);
  });

  it('apagada, dos CF-Connecting-IP distintas comparten el contador de los saltos', async () => {
    const app = appWith({ trustCloudflare: false, hops: 1 });
    await loginFrom(app, '203.0.113.7').expect(401);
    await loginFrom(app, '198.51.100.9').expect(401);
    expect((await loginFrom(app, '192.0.2.44')).status).toBe(429);
  });

  it('en IPv6 cuenta por la misma red /56 de la lectora', async () => {
    const app = appWith();
    await loginFrom(app, '2800:4f0:1a2:ff00::1').expect(401);
    await loginFrom(app, '2800:4f0:1a2:ff00::2').expect(401);
    expect((await loginFrom(app, '2800:4f0:1a2:ff00::3')).status).toBe(429);
    expect((await loginFrom(app, '2800:4f0:9999:ff00::1')).status).toBe(401);
  });
});

describe('GET /api/admin/network-check con Cloudflare', () => {
  const url = '/api/admin/network-check';

  it('encendida: la IP resuelta es la de la cabecera y se ven los candidatos hasta 5 saltos', async () => {
    const { admin } = await staffWorld({
      env: { TRUST_CLOUDFLARE_HEADER: 'true', TRUST_PROXY_HOPS: '1' },
    });
    const res = await admin
      .get(url)
      .set('X-Forwarded-For', `190.12.34.56, ${INTERNAL_CHAIN}`)
      .set('CF-Connecting-IP', '190.12.34.56')
      .expect(200);
    const out = networkCheckResponseSchema.parse(res.body);
    expect(out).toMatchObject({
      trustCloudflareHeader: true,
      cfConnectingIpValid: true,
      resolvedSource: 'cf-connecting-ip',
      resolvedMasked: '190.12.34.x',
      resolvedByHopsMasked: '10.29.1.x',
      resolvedWithCloudflareMasked: '190.12.34.x',
    });
    expect(out.candidates.map((c) => c.hops)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(JSON.stringify(res.body)).not.toMatch(/190\.12\.34\.56|10\.29\.1\.[78]\b/);
  });

  it('apagada: sigue resolviendo por saltos pero muestra la que saldría con la cabecera', async () => {
    const { admin } = await staffWorld({ env: { TRUST_PROXY_HOPS: '1' } });
    const out = networkCheckResponseSchema.parse(
      (
        await admin
          .get(url)
          .set('X-Forwarded-For', INTERNAL_CHAIN)
          .set('CF-Connecting-IP', '190.12.34.56')
          .expect(200)
      ).body,
    );
    expect(out).toMatchObject({
      trustCloudflareHeader: false,
      resolvedSource: 'trust-proxy-hops',
      resolvedMasked: '10.29.1.x',
      resolvedWithCloudflareMasked: '190.12.34.x',
    });
  });

  it('encendida pero con la cabecera inválida: lo avisa y sigue por saltos', async () => {
    const { admin } = await staffWorld({ env: { TRUST_CLOUDFLARE_HEADER: 'true' } });
    const out = networkCheckResponseSchema.parse(
      (
        await admin
          .get(url)
          .set('X-Forwarded-For', INTERNAL_CHAIN)
          .set('CF-Connecting-IP', 'basura')
          .expect(200)
      ).body,
    );
    expect(out).toMatchObject({
      hasCfConnectingIp: true,
      cfConnectingIpValid: false,
      resolvedSource: 'trust-proxy-hops',
      resolvedWithCloudflareMasked: null,
    });
    expect(JSON.stringify(out)).not.toContain('basura');
  });
});
