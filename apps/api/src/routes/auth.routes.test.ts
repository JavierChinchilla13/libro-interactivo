import { apiErrorSchema, authResponseSchema, type Role } from '@libro/shared';
import type { Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../app.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../lib/cookies.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { hashPassword } from '../services/password.service.js';
import { REFRESH_REUSE_GRACE_MS } from '../services/auth.service.js';
import { createTestApp, createTestClock } from '../test-utils/app.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const VALID = { name: 'Ana López', email: 'ana@ejemplo.com', password: 'Nube-Azul-Cuatro-87' };
const MINUTE = 60_000;

const post = (app: Express, path: string, body?: object) =>
  request(app).post(`/api/auth${path}`).send(body);

function setCookies(res: request.Response): string[] {
  return (res.headers['set-cookie'] ?? []) as unknown as string[];
}

function cookieValue(res: request.Response, name: string): string | undefined {
  const line = setCookies(res).find((c) => c.startsWith(`${name}=`));
  const value = line?.split(';')[0]?.slice(name.length + 1);
  return value ? decodeURIComponent(value) : undefined;
}

/** Cabecera Cookie para enviar tokens concretos (simula lo que haría el navegador). */
const cookieHeader = (pairs: Record<string, string | undefined>) =>
  Object.entries(pairs)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');

async function createUser(
  overrides: { email?: string; role?: Role; status?: 'active' | 'disabled' } = {},
) {
  const email = overrides.email ?? 'usuario@ejemplo.com';
  return User.create({
    email,
    emailNormalized: email.toLowerCase(),
    name: 'Persona de Prueba',
    passwordHash: await hashPassword(VALID.password),
    role: overrides.role ?? 'USER',
    status: overrides.status ?? 'active',
  });
}

describe('POST /api/auth/register', () => {
  it('crea la cuenta, inicia sesión y no expone datos sensibles', async () => {
    const app = createTestApp();
    const res = await post(app, '/register', VALID);

    expect(res.status).toBe(201);
    const { user } = authResponseSchema.parse(res.body);
    expect(user).toMatchObject({ name: 'Ana López', email: 'ana@ejemplo.com', role: 'USER' });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);
    expect(res.text).not.toContain(VALID.password);

    const stored = await User.findOne({ emailNormalized: 'ana@ejemplo.com' });
    expect(stored?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(stored?.passwordHash).not.toContain(VALID.password);
  });

  it('entrega las cookies de sesión httpOnly, SameSite=Lax y con ruta acotada', async () => {
    const res = await post(createTestApp(), '/register', VALID);
    const access = setCookies(res).find((c) => c.startsWith(`${ACCESS_COOKIE}=`)) ?? '';
    const refresh = setCookies(res).find((c) => c.startsWith(`${REFRESH_COOKIE}=`)) ?? '';

    for (const cookie of [access, refresh]) {
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('Secure'); // solo en producción (HTTP en desarrollo)
    }
    expect(access).toContain('Path=/api;');
    expect(refresh).toContain('Path=/api/auth;');
  });

  it('en producción las cookies llevan Secure', async () => {
    const app = createTestApp({
      env: {
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/x',
        CORS_ORIGIN: 'https://app.ejemplo.com',
        JWT_ACCESS_SECRET: 'p'.repeat(40),
        APP_URL: 'https://app.ejemplo.com',
        MAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_clave_de_prueba',
        MAIL_FROM: 'avisos@ejemplo.com',
      },
    });
    const res = await post(app, '/register', VALID);
    expect(res.status).toBe(201);
    for (const cookie of setCookies(res)) expect(cookie).toContain('Secure');
  });

  it.each([
    ['correo inválido', { ...VALID, email: 'no-es-correo' }],
    ['contraseña corta', { ...VALID, password: 'Corta1!' }],
    ['contraseña común', { ...VALID, password: 'password123' }],
    ['contraseña con el nombre', { ...VALID, password: 'Ana-López-2026-x' }],
    ['sin nombre', { ...VALID, name: '' }],
    ['sin cuerpo', undefined],
  ])('rechaza %s con 400 VALIDATION', async (_label, body) => {
    const res = await post(createTestApp(), '/register', body);
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION');
    expect(await User.countDocuments()).toBe(0);
  });

  it('un correo no puede tener dos cuentas (ni con otras mayúsculas o espacios) y la respuesta es genérica', async () => {
    const app = createTestApp();
    await post(app, '/register', VALID).expect(201);
    const dup = await post(app, '/register', { ...VALID, email: '  ANA@Ejemplo.COM ' });

    expect(dup.status).toBe(409);
    const error = apiErrorSchema.parse(dup.body).error;
    expect(error.code).toBe('CONFLICT');
    expect(error.message).not.toContain('ana@');
    expect(await User.countDocuments()).toBe(1);
  });

  it('dos registros simultáneos con el mismo correo: solo uno se crea (índice único)', async () => {
    const app = createTestApp();
    const results = await Promise.all([
      post(app, '/register', VALID),
      post(app, '/register', VALID),
      post(app, '/register', VALID),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await User.countDocuments()).toBe(1);
  });

  it('la base de datos tiene el índice único del correo y el TTL de sesiones', async () => {
    const userIndexes = await User.collection.indexes();
    expect(userIndexes.some((i) => i.key['emailNormalized'] === 1 && i.unique === true)).toBe(true);
    const tokenIndexes = await RefreshToken.collection.indexes();
    expect(tokenIndexes.some((i) => i.key['expiresAt'] === 1 && i.expireAfterSeconds === 0)).toBe(
      true,
    );
    expect(tokenIndexes.some((i) => i.key['tokenHash'] === 1 && i.unique === true)).toBe(true);
  });
});

describe('POST /api/auth/login', () => {
  it('inicia sesión con el correo en cualquier combinación de mayúsculas', async () => {
    const app = createTestApp();
    await post(app, '/register', VALID).expect(201);
    const res = await post(app, '/login', { email: 'ANA@ejemplo.com ', password: VALID.password });
    expect(res.status).toBe(200);
    expect(authResponseSchema.parse(res.body).user.email).toBe('ana@ejemplo.com');
    expect(cookieValue(res, ACCESS_COOKIE)).toBeTruthy();
    expect(cookieValue(res, REFRESH_COOKIE)).toBeTruthy();
  });

  it('contraseña incorrecta y correo inexistente dan exactamente la misma respuesta', async () => {
    const app = createTestApp();
    await post(app, '/register', VALID).expect(201);
    const wrongPassword = await post(app, '/login', {
      email: VALID.email,
      password: 'otra-clave-123',
    });
    const unknownEmail = await post(app, '/login', {
      email: 'nadie@ejemplo.com',
      password: 'otra-clave-123',
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(apiErrorSchema.parse(wrongPassword.body).error.code).toBe('AUTH_INVALID');
    expect(
      setCookies(wrongPassword).filter((c) => !c.includes('Expires=Thu, 01 Jan 1970')),
    ).toEqual([]);
  });

  it('una cuenta desactivada no entra ni con la contraseña correcta (mismo mensaje)', async () => {
    const app = createTestApp();
    await createUser({ status: 'disabled' });
    const res = await post(app, '/login', {
      email: 'usuario@ejemplo.com',
      password: VALID.password,
    });
    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('AUTH_INVALID');
  });

  it('bloquea temporalmente tras 5 fallos, aunque luego la contraseña sea correcta, y se libera con el tiempo', async () => {
    const clock = createTestClock();
    const app = createTestApp({ clock });
    await createUser();
    const creds = { email: 'usuario@ejemplo.com' };

    for (let i = 0; i < 5; i += 1) {
      await post(app, '/login', { ...creds, password: 'incorrecta-123' }).expect(401);
    }
    const locked = await User.findOne({ emailNormalized: creds.email });
    expect(locked?.lockedUntil).toBeTruthy();

    // Bloqueada: la contraseña correcta tampoco entra, con el mismo mensaje.
    const stillLocked = await post(app, '/login', { ...creds, password: VALID.password });
    expect(stillLocked.status).toBe(401);
    expect(apiErrorSchema.parse(stillLocked.body).error.message).toContain('demasiados intentos');

    clock.advance(16 * MINUTE);
    const ok = await post(app, '/login', { ...creds, password: VALID.password });
    expect(ok.status).toBe(200);
    const reset = await User.findOne({ emailNormalized: creds.email });
    expect(reset?.failedLoginCount).toBe(0);
    expect(reset?.lockedUntil ?? null).toBeNull();
  });

  it('el segundo bloqueo dura más que el primero', async () => {
    const clock = createTestClock();
    const app = createTestApp({ clock });
    await createUser();
    const bad = { email: 'usuario@ejemplo.com', password: 'incorrecta-123' };

    for (let i = 0; i < 5; i += 1) await post(app, '/login', bad);
    clock.advance(16 * MINUTE); // termina el primer bloqueo (15 min)
    for (let i = 0; i < 5; i += 1) await post(app, '/login', bad);

    clock.advance(16 * MINUTE); // el segundo bloqueo es de 30 min: sigue activo
    const res = await post(app, '/login', { email: bad.email, password: VALID.password });
    expect(res.status).toBe(401);
    clock.advance(15 * MINUTE);
    await post(app, '/login', { email: bad.email, password: VALID.password }).expect(200);
  });

  it('aplica límite de intentos por IP (429 con el formato estándar)', async () => {
    const app = createTestApp({ limits: { login: { windowMs: MINUTE, limit: 3 } } });
    const body = { email: 'nadie@ejemplo.com', password: 'x-clave-123' };
    for (let i = 0; i < 3; i += 1) await post(app, '/login', body).expect(401);
    const res = await post(app, '/login', body);
    expect(res.status).toBe(429);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
  });
});

describe('POST /api/auth/refresh', () => {
  async function loggedIn(app: Express) {
    const res = await post(app, '/register', VALID).expect(201);
    return {
      access: cookieValue(res, ACCESS_COOKIE),
      refresh: cookieValue(res, REFRESH_COOKIE) as string,
    };
  }
  const refreshWith = (app: Express, refresh: string | undefined) =>
    request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: refresh }));

  it('rota el token: entrega uno nuevo y el anterior deja de servir', async () => {
    const clock = createTestClock();
    const app = createTestApp({ clock });
    const { refresh } = await loggedIn(app);

    const res = await refreshWith(app, refresh);
    expect(res.status).toBe(200);
    const next = cookieValue(res, REFRESH_COOKIE);
    expect(next).toBeTruthy();
    expect(next).not.toBe(refresh);
    expect(cookieValue(res, ACCESS_COOKIE)).toBeTruthy();

    clock.advance(REFRESH_REUSE_GRACE_MS + 1000);
    await refreshWith(app, refresh).expect(401);
  });

  it('reutilizar un token ya rotado (fuera de la ventana de gracia) revoca toda la familia', async () => {
    const clock = createTestClock();
    const app = createTestApp({ clock });
    const { refresh: original } = await loggedIn(app);

    const rotated = await refreshWith(app, original).expect(200);
    const legit = cookieValue(rotated, REFRESH_COOKIE);
    clock.advance(REFRESH_REUSE_GRACE_MS + 1000);

    await refreshWith(app, original).expect(401); // el ladrón reusa el token viejo…
    await refreshWith(app, legit).expect(401); // …y también cae la sesión legítima
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });

  it('dos refrescos simultáneos con el mismo token no tumban la sesión (ventana de gracia)', async () => {
    const app = createTestApp();
    const { refresh } = await loggedIn(app);

    const [a, b] = await Promise.all([refreshWith(app, refresh), refreshWith(app, refresh)]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);

    const winner = a.status === 200 ? a : b;
    await refreshWith(app, cookieValue(winner, REFRESH_COOKIE)).expect(200);
  });

  it('un refresh caducado no sirve', async () => {
    const clock = createTestClock();
    const app = createTestApp({ clock });
    const { refresh } = await loggedIn(app);
    clock.advance(31 * 24 * 60 * MINUTE);
    const res = await refreshWith(app, refresh);
    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('UNAUTHENTICATED');
  });

  it('sin cookie, con basura o con un token inventado responde 401', async () => {
    const app = createTestApp();
    await refreshWith(app, undefined).expect(401);
    await refreshWith(app, 'basura').expect(401);
    await refreshWith(app, 'a'.repeat(43)).expect(401);
  });

  it('un usuario desactivado no puede refrescar', async () => {
    const app = createTestApp();
    const { refresh } = await loggedIn(app);
    await User.updateOne({ emailNormalized: VALID.email }, { status: 'disabled' });
    await refreshWith(app, refresh).expect(401);
  });

  it('en la BD solo se guarda el hash del refresh token', async () => {
    const app = createTestApp();
    const { refresh } = await loggedIn(app);
    const stored = await RefreshToken.findOne();
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.tokenHash).not.toBe(refresh);
    expect(JSON.stringify(stored)).not.toContain(refresh);
  });
});

describe('POST /api/auth/logout', () => {
  it('cierra la sesión: borra cookies y el refresh deja de servir', async () => {
    const app = createTestApp();
    const reg = await post(app, '/register', VALID).expect(201);
    const refresh = cookieValue(reg, REFRESH_COOKIE);

    const out = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: refresh }));
    expect(out.status).toBe(204);
    expect(setCookies(out).every((c) => c.includes('Expires=Thu, 01 Jan 1970'))).toBe(true);

    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookieHeader({ [REFRESH_COOKIE]: refresh }))
      .expect(401);
  });

  it('es idempotente: sin sesión también responde 204', async () => {
    await post(createTestApp(), '/logout').expect(204);
  });
});

describe('guards requireAuth / requireRole', () => {
  const makeApp = (clock = createTestClock()) =>
    createTestApp({
      clock,
      configure: (app, { guards }) => {
        app.get('/api/prueba/privada', guards.requireAuth, (_req, res) => {
          res.json({ ok: true });
        });
        app.get(
          '/api/prueba/admin',
          guards.requireAuth,
          guards.requireRole('ADMIN'),
          (_req, res) => {
            res.json({ ok: true });
          },
        );
        app.get(
          '/api/prueba/contenido',
          guards.requireAuth,
          guards.requireRole('EDITOR', 'ADMIN'),
          (_req, res) => {
            res.json({ ok: true });
          },
        );
      },
    });

  async function sessionFor(app: Express, user: { email: string }) {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ email: user.email, password: VALID.password })
      .expect(200);
    return agent;
  }

  it('sin sesión responde 401 UNAUTHENTICATED', async () => {
    const res = await request(makeApp()).get('/api/prueba/privada');
    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('UNAUTHENTICATED');
  });

  it('con sesión válida deja pasar', async () => {
    const app = makeApp();
    await createUser();
    const agent = await sessionFor(app, { email: 'usuario@ejemplo.com' });
    await agent.get('/api/prueba/privada').expect(200);
  });

  it('un lector recibe 403 en rutas de administración y de contenido', async () => {
    const app = makeApp();
    await createUser();
    const agent = await sessionFor(app, { email: 'usuario@ejemplo.com' });
    const res = await agent.get('/api/prueba/admin');
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('FORBIDDEN');
    await agent.get('/api/prueba/contenido').expect(403);
  });

  it('EDITOR entra a contenido pero no a administración; ADMIN entra a ambas listadas', async () => {
    const app = makeApp();
    await createUser({ email: 'editora@ejemplo.com', role: 'EDITOR' });
    await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });

    const editora = await sessionFor(app, { email: 'editora@ejemplo.com' });
    await editora.get('/api/prueba/contenido').expect(200);
    await editora.get('/api/prueba/admin').expect(403);

    const admin = await sessionFor(app, { email: 'admin@ejemplo.com' });
    await admin.get('/api/prueba/admin').expect(200);
    await admin.get('/api/prueba/contenido').expect(200);
  });

  it('el access token caduca solo; el refresh entrega uno nuevo', async () => {
    const clock = createTestClock();
    const app = makeApp(clock);
    await createUser();
    const agent = await sessionFor(app, { email: 'usuario@ejemplo.com' });

    clock.advance(16 * MINUTE); // más que los 15 min de vida del access token
    await agent.get('/api/prueba/privada').expect(401);
    await agent.post('/api/auth/refresh').expect(200);
    await agent.get('/api/prueba/privada').expect(200);
  });

  it('subir tokenVersion invalida de inmediato los access tokens vigentes', async () => {
    const app = makeApp();
    await createUser();
    const agent = await sessionFor(app, { email: 'usuario@ejemplo.com' });
    await agent.get('/api/prueba/privada').expect(200);

    await User.updateOne({ emailNormalized: 'usuario@ejemplo.com' }, { $inc: { tokenVersion: 1 } });
    await agent.get('/api/prueba/privada').expect(401);
  });

  it('un usuario desactivado pierde el acceso aunque su token no haya caducado', async () => {
    const app = makeApp();
    await createUser();
    const agent = await sessionFor(app, { email: 'usuario@ejemplo.com' });
    await User.updateOne({ emailNormalized: 'usuario@ejemplo.com' }, { status: 'disabled' });
    await agent.get('/api/prueba/privada').expect(401);
  });

  it('un cambio de rol en la BD aplica de inmediato (el rol no se confía al token)', async () => {
    const app = makeApp();
    await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
    const agent = await sessionFor(app, { email: 'admin@ejemplo.com' });
    await agent.get('/api/prueba/admin').expect(200);
    await User.updateOne({ emailNormalized: 'admin@ejemplo.com' }, { role: 'USER' });
    await agent.get('/api/prueba/admin').expect(403);
  });

  it('rechaza tokens manipulados o firmados con otra clave', async () => {
    const app = makeApp();
    await createUser();
    const reg = await post(app, '/login', {
      email: 'usuario@ejemplo.com',
      password: VALID.password,
    });
    const token = cookieValue(reg, ACCESS_COOKIE) as string;

    const tampered = `${token.slice(0, -3)}${token.endsWith('aaa') ? 'bbb' : 'aaa'}`;
    await request(app)
      .get('/api/prueba/privada')
      .set('Cookie', cookieHeader({ [ACCESS_COOKIE]: tampered }))
      .expect(401);

    const { SignJWT } = await import('jose');
    const user = await User.findOne({ emailNormalized: 'usuario@ejemplo.com' });
    const forged = await new SignJWT({ role: 'ADMIN', tv: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(user?._id))
      .setIssuer('libro-interactivo')
      .setAudience('libro-interactivo-web')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('otra-clave-distinta-de-la-del-servidor-0123456789'));
    await request(app)
      .get('/api/prueba/admin')
      .set('Cookie', cookieHeader({ [ACCESS_COOKIE]: forged }))
      .expect(401);
  });

  it('revokeAllSessions cierra todas las sesiones del usuario', async () => {
    const holder: { ctx?: AppContext } = {};
    const app = createTestApp({
      configure: (a, c) => {
        holder.ctx = c;
        a.get('/api/prueba/privada', c.guards.requireAuth, (_req, res) => {
          res.json({ ok: true });
        });
      },
    });
    const user = await createUser();
    const agent = await (async () => {
      const a = request.agent(app);
      await a
        .post('/api/auth/login')
        .send({ email: 'usuario@ejemplo.com', password: VALID.password })
        .expect(200);
      return a;
    })();
    await agent.get('/api/prueba/privada').expect(200);

    await holder.ctx?.auth.revokeAllSessions(user.id);
    await agent.get('/api/prueba/privada').expect(401);
    await agent.post('/api/auth/refresh').expect(401);
  });
});

describe('protección CSRF por origen', () => {
  it('rechaza peticiones que modifican datos desde un origen no permitido', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://sitio-malicioso.example')
      .send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('FORBIDDEN');
  });

  it('acepta el origen configurado y las peticiones sin Origin', async () => {
    const app = createTestApp();
    const body = { email: 'a@b.co', password: 'x' };
    await request(app)
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send(body)
      .expect(401);
    await request(app).post('/api/auth/login').send(body).expect(401);
  });
});
