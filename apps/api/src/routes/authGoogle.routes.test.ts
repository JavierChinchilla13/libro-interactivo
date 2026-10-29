import { AGE_RESTRICTED_MESSAGE, LEGAL_VERSION, googleLoginResponseSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../lib/cookies.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import type { GoogleProfile, GoogleVerifier } from '../services/google.service.js';
import { createTestApp, createTestClock } from '../test-utils/app.js';
import { ADULT_CONSENT, NOW, consentFor } from '../test-utils/consent.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const CREDENTIAL = 'a'.repeat(40);

/** Verificador falso: devuelve el perfil indicado para la credencial «buena» y `null` para cualquier otra. */
const verifier = (profile: GoogleProfile | null): GoogleVerifier => ({
  verify: async (credential) => (credential === CREDENTIAL ? profile : null),
});
const GOOD: GoogleProfile = { email: 'Lola@Ejemplo.com', emailVerified: true, name: 'Lola Pérez' };

const post = (app: ReturnType<typeof createTestApp>, body: object) =>
  request(app).post('/api/auth/google').send(body);

const cookiesOf = (res: request.Response) =>
  (res.headers['set-cookie'] ?? []) as unknown as string[];

describe('POST /api/auth/google · persona nueva en dos pasos', () => {
  it('primer paso: no crea nada, no abre sesión y pide la edad y los consentimientos', async () => {
    const app = createTestApp({ google: verifier(GOOD) });
    const res = await post(app, { credential: CREDENTIAL });

    expect(res.status).toBe(200);
    expect(googleLoginResponseSchema.parse(res.body)).toEqual({
      status: 'needs_profile',
      name: 'Lola Pérez',
      email: 'Lola@Ejemplo.com',
    });
    expect(cookiesOf(res)).toHaveLength(0);
    expect(await User.countDocuments({})).toBe(0);
    expect(await RefreshToken.countDocuments({})).toBe(0);
  });

  it('segundo paso: con edad y consentimientos crea la lectora y abre sesión', async () => {
    const app = createTestApp({ google: verifier(GOOD), clock: createTestClock(NOW) });
    const res = await post(app, { credential: CREDENTIAL, profile: ADULT_CONSENT });

    expect(res.status).toBe(200);
    const body = googleLoginResponseSchema.parse(res.body);
    expect(body.status).toBe('ok');
    if (body.status === 'ok') {
      expect(body.user).toMatchObject({
        email: 'Lola@Ejemplo.com',
        name: 'Lola Pérez',
        role: 'USER',
      });
    }
    expect(cookiesOf(res).some((c) => c.startsWith(`${ACCESS_COOKIE}=`))).toBe(true);
    expect(cookiesOf(res).some((c) => c.startsWith(`${REFRESH_COOKIE}=`))).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const user = await User.findOne({ emailNormalized: 'lola@ejemplo.com' }).lean();
    expect(user).toMatchObject({
      birthYear: 1990,
      birthMonth: 6,
      guardianAuthorized: false,
      termsVersion: LEGAL_VERSION,
    });
    expect(user?.termsAcceptedAt).toEqual(NOW);
    expect(user?.privacyConsentAt).toEqual(NOW);
  });

  it('de 16 a 17 años exige la casilla de autorización y la guarda', async () => {
    const app = createTestApp({ google: verifier(GOOD), clock: createTestClock(NOW) });
    // Nacida en 03/2009: 17 en octubre de 2026. Marcar «adulta» no coincide con su edad.
    const wrong = await post(app, {
      credential: CREDENTIAL,
      profile: consentFor(2009, 3, 'adult'),
    });
    expect(wrong.status).toBe(400);
    expect(await User.countDocuments({})).toBe(0);

    const right = await post(app, {
      credential: CREDENTIAL,
      profile: consentFor(2009, 3, 'minor_with_guardian'),
    });
    expect(right.status).toBe(200);
    expect((await User.findOne({}).lean())?.guardianAuthorized).toBe(true);
  });

  it('menor de 16: mismo rechazo amable, sin cuenta, sin sesión y sin ningún dato guardado', async () => {
    const app = createTestApp({ google: verifier(GOOD), clock: createTestClock(NOW) });
    const res = await post(app, { credential: CREDENTIAL, profile: consentFor(2012, 5) });

    expect(res.status).toBe(403);
    expect(res.body.error).toEqual({ code: 'AGE_RESTRICTED', message: AGE_RESTRICTED_MESSAGE });
    expect(cookiesOf(res)).toHaveLength(0);
    expect(await User.countDocuments({})).toBe(0);
    expect(await RefreshToken.countDocuments({})).toBe(0);
  });

  it('rechaza el segundo paso sin los dos consentimientos', async () => {
    const app = createTestApp({ google: verifier(GOOD), clock: createTestClock(NOW) });
    for (const missing of [{ acceptTerms: false }, { acceptPrivacy: false }]) {
      const res = await post(app, {
        credential: CREDENTIAL,
        profile: { ...ADULT_CONSENT, ...missing },
      });
      expect(res.status).toBe(400);
    }
    expect(await User.countDocuments({})).toBe(0);
  });

  it('tras 5 rechazos por edad, esa red recibe el mismo rechazo aunque la fecha sirva; otra red no', async () => {
    const clock = createTestClock(NOW);
    const app = createTestApp({
      google: verifier(GOOD),
      clock,
      env: { TRUST_CLOUDFLARE_HEADER: 'true' },
    });
    const send = (profile: object, ip: string) =>
      request(app)
        .post('/api/auth/google')
        .set('CF-Connecting-IP', ip)
        .send({ credential: CREDENTIAL, profile });
    for (let i = 0; i < 5; i += 1)
      expect((await send(consentFor(2012, 5), '203.0.113.7')).status).toBe(403);
    const blocked = await send(ADULT_CONSENT, '203.0.113.7');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('AGE_RESTRICTED');
    expect(await User.countDocuments({})).toBe(0);
    // Otra red no se ve afectada, y la primera vuelve a poder pasada la hora (aquí con otro correo).
    expect((await send(ADULT_CONSENT, '198.51.100.9')).status).toBe(200);
    clock.advance(61 * 60_000);
    expect((await send(ADULT_CONSENT, '203.0.113.7')).status).toBe(200);
  });
});

describe('POST /api/auth/google · cuentas que ya existen', () => {
  it('si la cuenta ya existe entra a ella sin pedir nada, sin duplicarla ni cambiar su rol', async () => {
    await User.create({
      email: 'lola@ejemplo.com',
      emailNormalized: 'lola@ejemplo.com',
      name: 'Lola Admin',
      passwordHash: 'x'.repeat(20),
      role: 'ADMIN',
    });
    const app = createTestApp({ google: verifier(GOOD) });
    const res = await post(app, { credential: CREDENTIAL });

    expect(res.status).toBe(200);
    const body = googleLoginResponseSchema.parse(res.body);
    expect(body.status).toBe('ok');
    if (body.status === 'ok')
      expect(body.user).toMatchObject({ name: 'Lola Admin', role: 'ADMIN' });
    expect(await User.countDocuments({})).toBe(1);
  });

  it('una lectora anterior, sin fecha de nacimiento guardada, entra sin bloqueo y no se le agrega nada', async () => {
    await User.create({
      email: 'lola@ejemplo.com',
      emailNormalized: 'lola@ejemplo.com',
      name: 'Lola Vieja',
      passwordHash: 'x'.repeat(20),
      role: 'USER',
    });
    const app = createTestApp({ google: verifier(GOOD), clock: createTestClock(NOW) });
    // Aunque mande un perfil (o uno de menor), la cuenta existente entra como siempre y no se modifica.
    for (const profile of [undefined, consentFor(2012, 5)]) {
      const res = await post(app, { credential: CREDENTIAL, ...(profile ? { profile } : {}) });
      expect(res.status).toBe(200);
      expect(googleLoginResponseSchema.parse(res.body).status).toBe('ok');
    }
    const user = await User.findOne({}).lean();
    expect(user?.birthYear).toBeUndefined();
    expect(user?.termsAcceptedAt).toBeUndefined();
    expect(user?.guardianAuthorized).toBeUndefined();
  });
});

describe('POST /api/auth/google · errores', () => {
  it('rechaza una credencial que Google no valida, con el mensaje genérico', async () => {
    const app = createTestApp({ google: verifier(GOOD) });
    const res = await post(app, { credential: 'b'.repeat(40) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID');
    expect(await User.countDocuments({})).toBe(0);
  });

  it('rechaza un correo que Google no verificó', async () => {
    const app = createTestApp({ google: verifier({ ...GOOD, emailVerified: false }) });
    const res = await post(app, { credential: CREDENTIAL, profile: ADULT_CONSENT });
    expect(res.status).toBe(401);
    expect(await User.countDocuments({})).toBe(0);
  });

  it('no deja entrar a una cuenta desactivada', async () => {
    await User.create({
      email: 'lola@ejemplo.com',
      emailNormalized: 'lola@ejemplo.com',
      name: 'Lola',
      passwordHash: 'x'.repeat(20),
      role: 'USER',
      status: 'disabled',
    });
    const app = createTestApp({ google: verifier(GOOD) });
    const res = await post(app, { credential: CREDENTIAL });
    expect(res.status).toBe(401);
  });

  it('valida el cuerpo y responde 404 si Google no está configurado', async () => {
    const configured = createTestApp({ google: verifier(GOOD) });
    expect((await post(configured, {})).status).toBe(400);
    const off = createTestApp();
    expect((await post(off, { credential: CREDENTIAL })).status).toBe(404);
  });
});
