import { apiErrorSchema, authResponseSchema, messageResponseSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../lib/cookies.js';
import { User } from '../models/User.js';
import { createTestHarness } from '../test-utils/app.js';
import {
  NEW_PASSWORD,
  PASSWORD,
  cookieValue,
  createUser,
  loginAgent,
  setCookies,
} from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

describe('GET /api/me', () => {
  it('sin sesión responde 401', async () => {
    const { app } = createTestHarness();
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('UNAUTHENTICATED');
  });

  it('devuelve el perfil sin datos sensibles', async () => {
    const { app } = createTestHarness();
    await createUser();
    const agent = await loginAgent(app);
    const res = await agent.get('/api/me').expect(200);
    const { user } = authResponseSchema.parse(res.body);
    expect(user).toMatchObject({
      email: 'usuario@ejemplo.com',
      name: 'Persona de Prueba',
      role: 'USER',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|tokenVersion/i);
  });
});

describe('PATCH /api/me', () => {
  it('cambia el nombre y devuelve el perfil actualizado', async () => {
    const { app } = createTestHarness();
    await createUser();
    const agent = await loginAgent(app);
    const res = await agent.patch('/api/me').send({ name: '  Nuevo Nombre ' }).expect(200);
    expect(authResponseSchema.parse(res.body).user.name).toBe('Nuevo Nombre');
    expect((await User.findOne({ emailNormalized: 'usuario@ejemplo.com' }))?.name).toBe(
      'Nuevo Nombre',
    );
  });

  it('el correo y el rol NO se pueden cambiar desde aquí', async () => {
    const { app } = createTestHarness();
    await createUser();
    const agent = await loginAgent(app);
    await agent
      .patch('/api/me')
      .send({ name: 'Otro Nombre', email: 'otro@ejemplo.com', role: 'ADMIN' })
      .expect(200);
    const stored = await User.findOne({ emailNormalized: 'usuario@ejemplo.com' });
    expect(stored?.email).toBe('usuario@ejemplo.com');
    expect(stored?.role).toBe('USER');
    expect(await User.countDocuments({ emailNormalized: 'otro@ejemplo.com' })).toBe(0);
  });

  it('rechaza un nombre inválido con 400 y exige sesión', async () => {
    const { app } = createTestHarness();
    await createUser();
    const agent = await loginAgent(app);
    const bad = await agent.patch('/api/me').send({ name: 'A' });
    expect(bad.status).toBe(400);
    expect(apiErrorSchema.parse(bad.body).error.code).toBe('VALIDATION');
    await request(app).patch('/api/me').send({ name: 'Nombre Válido' }).expect(401);
  });
});

describe('POST /api/auth/change-password', () => {
  const body = (over: Partial<Record<string, string>> = {}) => ({
    currentPassword: PASSWORD,
    newPassword: NEW_PASSWORD,
    newPasswordConfirm: NEW_PASSWORD,
    ...over,
  });

  it('exige sesión', async () => {
    const { app } = createTestHarness();
    await request(app).post('/api/auth/change-password').send(body()).expect(401);
  });

  it('cambia la contraseña: la nueva sirve, la vieja no, y avisa por correo', async () => {
    const { app, mail, flush } = createTestHarness();
    await createUser();
    const agent = await loginAgent(app);

    const res = await agent.post('/api/auth/change-password').send(body());
    expect(res.status).toBe(200);
    expect(messageResponseSchema.parse(res.body).message).toContain('actualiz');

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'usuario@ejemplo.com', password: PASSWORD })
      .expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'usuario@ejemplo.com', password: NEW_PASSWORD })
      .expect(200);

    await flush();
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe('usuario@ejemplo.com');
    expect(mail.sent[0]?.subject).toContain('contraseña');
    expect(mail.sent[0]?.text).not.toContain(NEW_PASSWORD);
    expect(mail.sent[0]?.html).not.toContain(PASSWORD);
  });

  it('cierra las demás sesiones pero esta continúa con cookies nuevas', async () => {
    const { app } = createTestHarness();
    await createUser();
    const current = await loginAgent(app);
    const other = await loginAgent(app); // otro dispositivo
    await other.get('/api/me').expect(200);

    const res = await current.post('/api/auth/change-password').send(body()).expect(200);
    expect(cookieValue(res, ACCESS_COOKIE)).toBeTruthy();
    expect(cookieValue(res, REFRESH_COOKIE)).toBeTruthy();

    await current.get('/api/me').expect(200); // sigue con sesión
    await other.get('/api/me').expect(401); // el otro dispositivo quedó fuera
    await other.post('/api/auth/refresh').expect(401);
  });

  it('rechaza una contraseña actual incorrecta (400, no cierra la sesión)', async () => {
    const { app, mail, flush } = createTestHarness();
    await createUser();
    const agent = await loginAgent(app);
    const res = await agent
      .post('/api/auth/change-password')
      .send(body({ currentPassword: 'incorrecta-123' }));
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.message).toContain('actual no es correcta');
    await agent.get('/api/me').expect(200);
    await flush();
    expect(mail.sent).toHaveLength(0);
  });

  it.each([
    ['las dos contraseñas no coinciden', { newPasswordConfirm: 'Otra-Distinta-123x' }],
    ['la nueva es común', { newPassword: 'password123', newPasswordConfirm: 'password123' }],
    ['la nueva es corta', { newPassword: 'Corta1!', newPasswordConfirm: 'Corta1!' }],
    [
      'la nueva contiene el nombre',
      { newPassword: 'Persona-de-Prueba-9', newPasswordConfirm: 'Persona-de-Prueba-9' },
    ],
    ['la nueva es igual a la actual', { newPassword: PASSWORD, newPasswordConfirm: PASSWORD }],
  ])('rechaza con 400 cuando %s', async (_label, override) => {
    const { app } = createTestHarness();
    await createUser();
    const agent = await loginAgent(app);
    const res = await agent.post('/api/auth/change-password').send(body(override));
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION');
    // La contraseña sigue siendo la original.
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'usuario@ejemplo.com', password: PASSWORD })
      .expect(200);
  });

  it('tiene límite de intentos', async () => {
    const { app } = createTestHarness({
      limits: { changePassword: { windowMs: 60_000, limit: 2 } },
    });
    await createUser();
    const agent = await loginAgent(app);
    const bad = body({ currentPassword: 'incorrecta-123' });
    await agent.post('/api/auth/change-password').send(bad).expect(400);
    await agent.post('/api/auth/change-password').send(bad).expect(400);
    const res = await agent.post('/api/auth/change-password').send(bad);
    expect(res.status).toBe(429);
  });

  it('no deja pasar sesiones de cuentas desactivadas', async () => {
    const { app } = createTestHarness();
    await createUser();
    const agent = await loginAgent(app);
    await User.updateOne({ emailNormalized: 'usuario@ejemplo.com' }, { status: 'disabled' });
    await agent.post('/api/auth/change-password').send(body()).expect(401);
    expect(setCookies(await agent.get('/api/me'))).toBeDefined();
  });
});
