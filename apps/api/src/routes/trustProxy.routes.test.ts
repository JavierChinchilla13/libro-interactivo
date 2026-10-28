import { apiErrorSchema } from '@libro/shared';
import type { Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import { addressForHops, parseForwardedFor } from '../lib/networkCheck.js';
import { createTestApp } from '../test-utils/app.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const MINUTE = 60_000;
const body = { email: 'nadie@ejemplo.com', password: 'x-clave-123' };

/** App con una ruta de prueba que devuelve la IP que el API considera de quien llama (`req.ip`). */
function appWithHops(hops: number | undefined, extra: Record<string, string> = {}) {
  return createTestApp({
    env: { ...(hops === undefined ? {} : { TRUST_PROXY_HOPS: String(hops) }), ...extra },
    limits: { login: { windowMs: MINUTE, limit: 2 } },
    configure: (app) => {
      app.get('/_ip', (req, res) => {
        res.json({ ip: req.ip });
      });
    },
  });
}
const ipSeenBy = async (app: Express, forwardedFor?: string) => {
  const req = request(app).get('/_ip');
  if (forwardedFor !== undefined) req.set('X-Forwarded-For', forwardedFor);
  return (await req.expect(200)).body.ip as string;
};
const loginFrom = (app: Express, forwardedFor: string) =>
  request(app).post('/api/auth/login').set('X-Forwarded-For', forwardedFor).send(body);

describe('TRUST_PROXY_HOPS', () => {
  it('por defecto: 0 fuera de producción y 1 en producción; acepta 0–5 y rechaza lo demás', () => {
    expect(parseEnv({ NODE_ENV: 'test' }).TRUST_PROXY_HOPS).toBe(0);
    expect(parseEnv({ NODE_ENV: 'test', TRUST_PROXY_HOPS: '3' }).TRUST_PROXY_HOPS).toBe(3);
    expect(() => parseEnv({ NODE_ENV: 'test', TRUST_PROXY_HOPS: '6' })).toThrow(/TRUST_PROXY_HOPS/);
    expect(() => parseEnv({ NODE_ENV: 'test', TRUST_PROXY_HOPS: '-1' })).toThrow(
      /TRUST_PROXY_HOPS/,
    );
    expect(() => parseEnv({ NODE_ENV: 'test', TRUST_PROXY_HOPS: 'uno' })).toThrow(
      /TRUST_PROXY_HOPS/,
    );
  });
});

describe('IP resuelta según los saltos de confianza', () => {
  // Cadena simulada: la persona (203.0.113.7), un primer proxy (198.51.100.2) que añade a la cadena, y la conexión
  // directa con el API, que en las pruebas es el propio equipo (127.0.0.1).
  const chain = '203.0.113.7, 198.51.100.2';

  it('0 saltos: se ignora X-Forwarded-For y siempre se ve la conexión directa', async () => {
    const app = appWithHops(0);
    expect(await ipSeenBy(app, chain)).toMatch(/127\.0\.0\.1$/);
    expect(await ipSeenBy(app)).toMatch(/127\.0\.0\.1$/);
  });

  it('1 salto: la última entrada; 2 saltos: la anterior; 3 o más (de más): la primera', async () => {
    expect(await ipSeenBy(appWithHops(1), chain)).toBe('198.51.100.2');
    expect(await ipSeenBy(appWithHops(2), chain)).toBe('203.0.113.7');
    expect(await ipSeenBy(appWithHops(3), chain)).toBe('203.0.113.7');
    expect(await ipSeenBy(appWithHops(5), chain)).toBe('203.0.113.7');
  });

  it('el diagnóstico calcula lo mismo que Express (para que lo que se mide sea lo que se aplica)', async () => {
    for (let hops = 0; hops <= 5; hops += 1) {
      const seen = await ipSeenBy(appWithHops(hops), chain);
      const expected = addressForHops('127.0.0.1', parseForwardedFor(chain), hops);
      expect(seen.replace('::ffff:', '')).toBe(expected);
    }
  });

  it('IPv6 y cabecera mal formada: no rompe y se usa la entrada que toca', async () => {
    expect(await ipSeenBy(appWithHops(1), '2800:4f0:1a2::9, 2800:4f0:1a2::1')).toBe(
      '2800:4f0:1a2::1',
    );
    expect(await ipSeenBy(appWithHops(1), 'basura, , ???')).toBe('???');
    expect(await ipSeenBy(appWithHops(2), '')).toMatch(/127\.0\.0\.1$/);
  });
});

describe('el limitador de ingreso cuenta por la IP resuelta', () => {
  it('con los saltos bien puestos, cada lectora tiene su propio contador', async () => {
    const app = appWithHops(1);
    for (let i = 0; i < 2; i += 1) expect((await loginFrom(app, '10.0.0.1')).status).toBe(401);
    const blocked = await loginFrom(app, '10.0.0.1');
    expect(blocked.status).toBe(429);
    expect(apiErrorSchema.parse(blocked.body).error.code).toBe('RATE_LIMITED');
    // Otra lectora (otra última entrada) no se ve afectada.
    expect((await loginFrom(app, '10.0.0.2')).status).toBe(401);
  });

  it('un atacante que antepone direcciones falsas no cambia su contador (con saltos bien puestos)', async () => {
    const app = appWithHops(1);
    // Todas terminan en la misma entrada, que es la que añadió el proxy de confianza.
    await loginFrom(app, '1.1.1.1, 10.0.0.9').expect(401);
    await loginFrom(app, '2.2.2.2, 10.0.0.9').expect(401);
    expect((await loginFrom(app, '3.3.3.3, 10.0.0.9')).status).toBe(429);
    expect((await loginFrom(app, '4.4.4.4, 5.5.5.5, 10.0.0.9')).status).toBe(429);
  });

  it('con 0 saltos (de menos) todas las lectoras comparten un solo contador', async () => {
    const app = appWithHops(0);
    await loginFrom(app, '10.0.0.1').expect(401);
    await loginFrom(app, '10.0.0.2').expect(401);
    expect((await loginFrom(app, '10.0.0.3')).status).toBe(429);
  });

  it('con saltos de más y una cadena corta, quien antepone direcciones falsas sí evade el límite', async () => {
    // Documenta el riesgo de confiar de más: se toma una entrada que el atacante escribió.
    const app = appWithHops(3);
    for (const fake of ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4']) {
      expect((await loginFrom(app, `${fake}, 10.0.0.9`)).status).toBe(401);
    }
  });
});
