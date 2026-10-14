import { authResponseSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../lib/cookies.js';
import { User } from '../models/User.js';
import type { GoogleProfile, GoogleVerifier } from '../services/google.service.js';
import { createTestApp } from '../test-utils/app.js';
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

describe('POST /api/auth/google', () => {
  it('crea una lectora con el correo verificado y abre sesión', async () => {
    const app = createTestApp({ google: verifier(GOOD) });
    const res = await post(app, { credential: CREDENTIAL });

    expect(res.status).toBe(200);
    const { user } = authResponseSchema.parse(res.body);
    expect(user).toMatchObject({ email: 'Lola@Ejemplo.com', name: 'Lola Pérez', role: 'USER' });
    const cookies = (res.headers['set-cookie'] ?? []) as unknown as string[];
    expect(cookies.some((c) => c.startsWith(`${ACCESS_COOKIE}=`))).toBe(true);
    expect(cookies.some((c) => c.startsWith(`${REFRESH_COOKIE}=`))).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(await User.countDocuments({ emailNormalized: 'lola@ejemplo.com' })).toBe(1);
  });

  it('si la cuenta ya existe entra a ella sin duplicarla ni cambiar su rol', async () => {
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
    expect(authResponseSchema.parse(res.body).user).toMatchObject({
      name: 'Lola Admin',
      role: 'ADMIN',
    });
    expect(await User.countDocuments({})).toBe(1);
  });

  it('rechaza una credencial que Google no valida, con el mensaje genérico', async () => {
    const app = createTestApp({ google: verifier(GOOD) });
    const res = await post(app, { credential: 'b'.repeat(40) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_INVALID');
    expect(await User.countDocuments({})).toBe(0);
  });

  it('rechaza un correo que Google no verificó', async () => {
    const app = createTestApp({ google: verifier({ ...GOOD, emailVerified: false }) });
    const res = await post(app, { credential: CREDENTIAL });
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
