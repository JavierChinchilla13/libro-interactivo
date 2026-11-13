import {
  AGE_RESTRICTED_MESSAGE,
  LEGAL_VERSION,
  apiErrorSchema,
  authResponseSchema,
} from '@libro/shared';
import mongoose from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { LOG_REDACTION } from '../lib/logger.js';
import { User } from '../models/User.js';
import { AGE_REJECTION_LIMIT } from '../services/ageGate.service.js';
import { createTestHarness, createTestApp, createTestClock } from '../test-utils/app.js';
import { ADULT_CONSENT, NOW, consentFor } from '../test-utils/consent.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const BASE = { name: 'Ana López', email: 'ana@ejemplo.com', password: 'Nube-Azul-Cuatro-87' };
const register = (
  app: ReturnType<typeof createTestApp>,
  body: object,
  headers: Record<string, string> = {},
) => {
  const req = request(app).post('/api/auth/register');
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req.send(body);
};
const appAt = (options: Parameters<typeof createTestApp>[0] = {}) =>
  createTestApp({ clock: createTestClock(NOW), ...options });

/** Cuántos documentos hay en toda la base de datos: «no se guardó nada» se prueba contra todas las colecciones. */
async function documentsStored(): Promise<number> {
  const collections = await mongoose.connection.db!.collections();
  const counts = await Promise.all(collections.map((c) => c.countDocuments({})));
  return counts.reduce((sum, n) => sum + n, 0);
}

describe('registro con edad y consentimientos', () => {
  it('persona adulta: crea la cuenta y guarda solo año, mes y los consentimientos', async () => {
    const app = appAt();
    const res = await register(app, { ...BASE, ...ADULT_CONSENT });

    expect(res.status).toBe(201);
    authResponseSchema.parse(res.body);
    // La respuesta no devuelve la fecha ni los consentimientos.
    expect(JSON.stringify(res.body)).not.toMatch(/birth|1990|termsVersion|guardian/);

    const user = await User.findOne({}).lean();
    expect(user).toMatchObject({
      birthYear: 1990,
      birthMonth: 6,
      guardianAuthorized: false,
      termsVersion: LEGAL_VERSION,
    });
    expect(user?.termsAcceptedAt).toEqual(NOW);
    expect(user?.privacyConsentAt).toEqual(NOW);
  });

  it('de 16 a 17 años con la autorización de madre, padre o tutor: entra y queda anotada', async () => {
    const app = appAt();
    // 16 en octubre de 2026 (nacida en 09/2010) y 17 (03/2009).
    for (const [email, year, month] of [
      ['a@ejemplo.com', 2010, 9],
      ['b@ejemplo.com', 2009, 3],
    ] as const) {
      const res = await register(app, {
        ...BASE,
        email,
        ...consentFor(year, month, 'minor_with_guardian'),
      });
      expect(res.status, email).toBe(201);
    }
    const stored = await User.find({}).lean();
    expect(stored.map((u) => u.guardianAuthorized)).toEqual([true, true]);
  });

  it('la casilla debe coincidir con la edad calculada (16 o 17 marcando «adulta», o al revés)', async () => {
    const app = appAt();
    for (const consent of [
      consentFor(2010, 9, 'adult'), // 16
      consentFor(2009, 3, 'adult'), // 17
      consentFor(1990, 6, 'minor_with_guardian'), // 36
    ]) {
      const res = await register(app, { ...BASE, ...consent });
      expect(res.status).toBe(400);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION');
    }
    expect(await User.countDocuments({})).toBe(0);
  });

  it('el límite es el final del mes: nacida en 10/2010 aún cuenta 15 en octubre de 2026', async () => {
    const app = appAt();
    const early = await register(app, { ...BASE, ...consentFor(2010, 10, 'minor_with_guardian') });
    expect(early.status).toBe(403);
    // Un mes después ya cuenta 16.
    const later = createTestApp({ clock: createTestClock(new Date('2026-11-01T12:00:00Z')) });
    const ok = await register(later, { ...BASE, ...consentFor(2010, 10, 'minor_with_guardian') });
    expect(ok.status).toBe(201);
  });

  it('exige los dos consentimientos, cada uno por su casilla', async () => {
    const app = appAt();
    for (const change of [
      { acceptTerms: false },
      { acceptPrivacy: false },
      { acceptTerms: undefined },
      { acceptPrivacy: 'true' },
    ]) {
      const res = await register(app, { ...BASE, ...ADULT_CONSENT, ...change });
      expect(res.status, JSON.stringify(change)).toBe(400);
    }
    expect(await User.countDocuments({})).toBe(0);
  });

  it('fecha futura, mes 0 o 13, año de texto o ausente: error de datos, sin cuenta', async () => {
    const app = appAt();
    for (const birth of [
      { year: 2026, month: 11 },
      { year: 2031, month: 1 },
      { year: 1990, month: 0 },
      { year: 1990, month: 13 },
      { year: '1990', month: 6 },
      { year: 1890, month: 6 },
      { year: 1900, month: 1 },
      {},
    ]) {
      const res = await register(app, { ...BASE, ...ADULT_CONSENT, birth });
      expect(res.status, JSON.stringify(birth)).toBe(400);
    }
    expect(await User.countDocuments({})).toBe(0);
  });

  it('no guarda campos de más: ni día de nacimiento, ni edad, ni un rol', async () => {
    const app = appAt();
    await register(app, { ...BASE, ...ADULT_CONSENT, birthDay: 14, age: 30, role: 'ADMIN' }).expect(
      201,
    );
    const user = await User.findOne({}).lean();
    expect(user?.role).toBe('USER');
    expect(Object.keys(user ?? {})).not.toEqual(expect.arrayContaining(['birthDay']));
    expect(Object.keys(user ?? {})).not.toEqual(expect.arrayContaining(['age']));
  });
});

describe('menor de 16 años', () => {
  const kid = {
    ...BASE,
    email: 'menor-secreto@ejemplo.com',
    name: 'Nombre Secreto',
    ...consentFor(2012, 5),
  };

  it('403 AGE_RESTRICTED con un mensaje único y amable, sin sesión', async () => {
    const res = await register(appAt(), kid);
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(res.body).error).toEqual({
      code: 'AGE_RESTRICTED',
      message: AGE_RESTRICTED_MESSAGE,
    });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('no se guarda nada en ninguna colección ni se envía ningún correo', async () => {
    const harness = createTestHarness({ clock: createTestClock(NOW) });
    await request(harness.app).post('/api/auth/register').send(kid).expect(403);
    await harness.flush();
    expect(await documentsStored()).toBe(0);
    expect(harness.mail.sent).toHaveLength(0);
  });

  it('el registro no revela si el correo ya existía: responde igual', async () => {
    const app = appAt();
    await register(app, { ...BASE, email: 'menor-secreto@ejemplo.com', ...ADULT_CONSENT }).expect(
      201,
    );
    const res = await register(app, kid);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AGE_RESTRICTED');
  });

  it('el registro del servidor no incluye el correo, el nombre ni la fecha', async () => {
    const lines: string[] = [];
    const logger = pino(
      { level: 'info', redact: LOG_REDACTION },
      { write: (line: string) => void lines.push(line) },
    );
    const app = createApp({
      env: parseEnv({ NODE_ENV: 'test' }),
      logger,
      isDbUp: () => true,
      clock: createTestClock(NOW),
    });
    await request(app).post('/api/auth/register').send(kid).expect(403);
    const log = lines.join('\n');
    expect(log).toContain('/api/auth/register'); // sí se registra que hubo una petición y su resultado
    expect(log).toContain('"statusCode":403');
    for (const secret of ['menor-secreto', 'Nombre Secreto', '2012', 'Nube-Azul']) {
      expect(log, secret).not.toContain(secret);
    }
  });

  it('tras 15 rechazos, esa red recibe el mismo rechazo aunque la fecha sirva; otra red no', async () => {
    const clock = createTestClock(NOW);
    const app = createTestApp({ clock, env: { TRUST_CLOUDFLARE_HEADER: 'true' } });
    const from = (ip: string, body: object) => register(app, body, { 'CF-Connecting-IP': ip });
    for (let i = 0; i < AGE_REJECTION_LIMIT; i += 1) {
      expect((await from('203.0.113.7', kid)).status).toBe(403);
    }

    const blocked = await from('203.0.113.7', { ...BASE, ...ADULT_CONSENT });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('AGE_RESTRICTED');
    expect(await User.countDocuments({})).toBe(0);

    expect((await from('198.51.100.9', { ...BASE, ...ADULT_CONSENT })).status).toBe(201);

    // Pasada la hora, la primera red vuelve a poder registrarse.
    clock.advance(61 * 60_000);
    const later = await from('203.0.113.7', {
      ...BASE,
      email: 'otra@ejemplo.com',
      ...ADULT_CONSENT,
    });
    expect(later.status).toBe(201);
  });

  it('solo cuentan los rechazos por edad: muchos registros correctos no cierran la puerta', async () => {
    const app = appAt();
    for (let i = 0; i < 8; i += 1) {
      const res = await register(app, {
        ...BASE,
        email: `lector${i}@ejemplo.com`,
        ...ADULT_CONSENT,
      });
      expect(res.status).toBe(201);
    }
    // Un error de datos (casilla que no coincide) tampoco cuenta como rechazo por edad.
    for (let i = 0; i < 6; i += 1) {
      await register(app, {
        ...BASE,
        email: `x${i}@ejemplo.com`,
        ...consentFor(2009, 3, 'adult'),
      }).expect(400);
    }
    await register(app, { ...BASE, email: 'ultima@ejemplo.com', ...ADULT_CONSENT }).expect(201);
  });

  it('un solo rechazo no impide que otra persona se registre desde la misma red', async () => {
    const app = appAt();
    await register(app, kid).expect(403);
    const res = await register(app, { ...BASE, ...ADULT_CONSENT });
    expect(res.status).toBe(201);
  });
});
