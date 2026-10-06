import { apiErrorSchema, messageResponseSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { PasswordReset } from '../models/PasswordReset.js';
import { User } from '../models/User.js';
import { MAX_RESET_EMAILS_PER_HOUR } from '../services/passwordReset.service.js';
import { createTestHarness, createTestClock } from '../test-utils/app.js';
import {
  MINUTE,
  NEW_PASSWORD,
  PASSWORD,
  createUser,
  loginAgent,
  resetTokenFrom,
} from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';

useTestDb();

const forgot = (app: Parameters<typeof request>[0], email: string) =>
  request(app).post('/api/auth/forgot-password').send({ email });

const reset = (app: Parameters<typeof request>[0], token: string, over: object = {}) =>
  request(app)
    .post('/api/auth/reset-password')
    .send({ token, newPassword: NEW_PASSWORD, newPasswordConfirm: NEW_PASSWORD, ...over });

/** Pide un enlace y devuelve el token que viaja en el correo. */
async function requestToken(
  harness: ReturnType<typeof createTestHarness>,
  email = 'usuario@ejemplo.com',
) {
  await forgot(harness.app, email).expect(200);
  await harness.flush();
  const last = harness.mail.sent.at(-1);
  if (!last) throw new Error('No se envió ningún correo');
  return resetTokenFrom(last.text);
}

describe('POST /api/auth/forgot-password', () => {
  it('envía el enlace al correo de una cuenta existente', async () => {
    const h = createTestHarness();
    await createUser();
    const res = await forgot(h.app, 'USUARIO@ejemplo.com ').expect(200);
    expect(messageResponseSchema.parse(res.body).message).toContain('Si el correo está registrado');

    await h.flush();
    expect(h.mail.sent).toHaveLength(1);
    const mail = h.mail.sent[0]!;
    expect(mail.to).toBe('usuario@ejemplo.com');
    expect(mail.subject).toContain('Restablece tu contraseña');
    expect(mail.text).toContain('http://localhost:5173/restablecer/');
    expect(mail.html).toContain('una sola vez');
  });

  it('responde EXACTAMENTE igual exista o no el correo, y no envía nada si no existe', async () => {
    const h = createTestHarness();
    await createUser();
    const known = await forgot(h.app, 'usuario@ejemplo.com');
    const unknown = await forgot(h.app, 'nadie@ejemplo.com');
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    await h.flush();
    expect(h.mail.sent).toHaveLength(1);
    expect(await PasswordReset.countDocuments()).toBe(1);
  });

  it('no envía nada a cuentas desactivadas (misma respuesta)', async () => {
    const h = createTestHarness();
    await createUser({ status: 'disabled' });
    await forgot(h.app, 'usuario@ejemplo.com').expect(200);
    await h.flush();
    expect(h.mail.sent).toHaveLength(0);
  });

  it('rechaza un correo con formato inválido', async () => {
    const h = createTestHarness();
    const res = await forgot(h.app, 'no-es-correo');
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION');
  });

  it('en la BD solo se guarda el hash del token y caduca según el TTL', async () => {
    const clock = createTestClock();
    const h = createTestHarness({ clock });
    await createUser();
    const token = await requestToken(h);

    const stored = await PasswordReset.findOne();
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(token.length).toBeGreaterThanOrEqual(43); // 256 bits en base64url
    expect(stored!.expiresAt.getTime() - clock().getTime()).toBe(30 * MINUTE);
  });

  it('un enlace nuevo invalida el anterior', async () => {
    const h = createTestHarness();
    await createUser();
    const first = await requestToken(h);
    const second = await requestToken(h);
    expect(second).not.toBe(first);

    const old = await reset(h.app, first);
    expect(old.status).toBe(400);
    expect(apiErrorSchema.parse(old.body).error.code).toBe('TOKEN_INVALID');
    await reset(h.app, second).expect(200);
  });

  it(`limita a ${MAX_RESET_EMAILS_PER_HOUR} correos por hora por cuenta (anti-acoso)`, async () => {
    const clock = createTestClock();
    const h = createTestHarness({ clock });
    await createUser();
    for (let i = 0; i < MAX_RESET_EMAILS_PER_HOUR + 2; i += 1) {
      await forgot(h.app, 'usuario@ejemplo.com').expect(200);
    }
    await h.flush();
    expect(h.mail.sent).toHaveLength(MAX_RESET_EMAILS_PER_HOUR);

    clock.advance(61 * MINUTE);
    await forgot(h.app, 'usuario@ejemplo.com').expect(200);
    await h.flush();
    expect(h.mail.sent).toHaveLength(MAX_RESET_EMAILS_PER_HOUR + 1);
  });

  it('tiene límite de intentos por IP', async () => {
    const h = createTestHarness({ limits: { forgotPassword: { windowMs: 60_000, limit: 2 } } });
    await forgot(h.app, 'a@ejemplo.com').expect(200);
    await forgot(h.app, 'b@ejemplo.com').expect(200);
    expect((await forgot(h.app, 'c@ejemplo.com')).status).toBe(429);
  });

  it('escapa el nombre del usuario en el HTML del correo', async () => {
    const h = createTestHarness();
    await createUser({ name: '<script>alert(1)</script>' });
    await forgot(h.app, 'usuario@ejemplo.com').expect(200);
    await h.flush();
    const html = h.mail.sent[0]!.html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('si el proveedor de correo falla, la respuesta sigue siendo la misma', async () => {
    const failing = {
      send: async () => {
        throw new Error('el proveedor está caído');
      },
    };
    const h = createTestHarness({ mail: failing });
    await createUser();
    const res = await forgot(h.app, 'usuario@ejemplo.com');
    expect(res.status).toBe(200);
    await h.flush();
  });
});

describe('POST /api/auth/reset-password', () => {
  it('cambia la contraseña: la nueva sirve y la vieja no', async () => {
    const h = createTestHarness();
    await createUser();
    const token = await requestToken(h);

    const res = await reset(h.app, token);
    expect(res.status).toBe(200);
    expect(messageResponseSchema.parse(res.body).message).toContain('actualiz');

    await request(h.app)
      .post('/api/auth/login')
      .send({ email: 'usuario@ejemplo.com', password: PASSWORD })
      .expect(401);
    await request(h.app)
      .post('/api/auth/login')
      .send({ email: 'usuario@ejemplo.com', password: NEW_PASSWORD })
      .expect(200);
  });

  it('el enlace es de un solo uso', async () => {
    const h = createTestHarness();
    await createUser();
    const token = await requestToken(h);
    await reset(h.app, token).expect(200);
    const again = await reset(h.app, token);
    expect(again.status).toBe(400);
    expect(apiErrorSchema.parse(again.body).error.code).toBe('TOKEN_INVALID');
  });

  it('el enlace caduca', async () => {
    const clock = createTestClock();
    const h = createTestHarness({ clock });
    await createUser();
    const token = await requestToken(h);
    clock.advance(31 * MINUTE);
    const res = await reset(h.app, token);
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('TOKEN_INVALID');
  });

  it('caducado, usado e inventado dan exactamente el mismo mensaje', async () => {
    const clock = createTestClock();
    const h = createTestHarness({ clock });
    await createUser();
    const used = await requestToken(h);
    await reset(h.app, used).expect(200);
    const expired = await requestToken(h);
    clock.advance(31 * MINUTE);

    const bodies = [
      (await reset(h.app, used)).body,
      (await reset(h.app, expired)).body,
      (await reset(h.app, 'x'.repeat(43))).body,
    ];
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });

  it('cierra TODAS las sesiones abiertas y avisa por correo', async () => {
    const h = createTestHarness();
    await createUser();
    const agent = await loginAgent(h.app);
    await agent.get('/api/me').expect(200);

    const token = await requestToken(h);
    await reset(h.app, token).expect(200);
    await h.flush();

    await agent.get('/api/me').expect(401);
    await agent.post('/api/auth/refresh').expect(401);
    const notice = h.mail.sent.at(-1)!;
    expect(notice.subject).toContain('fue cambiada');
    expect(notice.text).not.toContain(NEW_PASSWORD);
  });

  it('una contraseña débil NO gasta el enlace (se puede reintentar)', async () => {
    const h = createTestHarness();
    await createUser();
    const token = await requestToken(h);

    const weak = await reset(h.app, token, {
      newPassword: 'password123',
      newPasswordConfirm: 'password123',
    });
    expect(weak.status).toBe(400);
    expect(apiErrorSchema.parse(weak.body).error.code).toBe('VALIDATION');
    const withName = await reset(h.app, token, {
      newPassword: 'Persona-de-Prueba-9',
      newPasswordConfirm: 'Persona-de-Prueba-9',
    });
    expect(withName.status).toBe(400);
    const mismatch = await reset(h.app, token, { newPasswordConfirm: 'Otra-Distinta-123x' });
    expect(mismatch.status).toBe(400);

    await reset(h.app, token).expect(200); // el enlace seguía vivo
  });

  it('levanta el bloqueo temporal de la cuenta', async () => {
    const h = createTestHarness();
    await createUser();
    for (let i = 0; i < 5; i += 1) {
      await request(h.app)
        .post('/api/auth/login')
        .send({ email: 'usuario@ejemplo.com', password: 'incorrecta-123' })
        .expect(401);
    }
    await request(h.app)
      .post('/api/auth/login')
      .send({ email: 'usuario@ejemplo.com', password: PASSWORD })
      .expect(401); // bloqueada

    const token = await requestToken(h);
    await reset(h.app, token).expect(200);
    await request(h.app)
      .post('/api/auth/login')
      .send({ email: 'usuario@ejemplo.com', password: NEW_PASSWORD })
      .expect(200);
    expect((await User.findOne({ emailNormalized: 'usuario@ejemplo.com' }))?.failedLoginCount).toBe(
      0,
    );
  });

  it('dos canjes simultáneos del mismo enlace: solo uno funciona', async () => {
    const h = createTestHarness();
    await createUser();
    const token = await requestToken(h);
    const results = await Promise.all([
      reset(h.app, token),
      reset(h.app, token),
      reset(h.app, token),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400]);
  });

  it('no sirve para cuentas desactivadas después de pedir el enlace', async () => {
    const h = createTestHarness();
    await createUser();
    const token = await requestToken(h);
    await User.updateOne({ emailNormalized: 'usuario@ejemplo.com' }, { status: 'disabled' });
    expect((await reset(h.app, token)).status).toBe(400);
  });

  it('valida la forma de la petición y tiene límite de intentos', async () => {
    const h = createTestHarness({ limits: { resetPassword: { windowMs: 60_000, limit: 2 } } });
    expect((await reset(h.app, 'corto')).status).toBe(400);
    expect((await reset(h.app, 'x'.repeat(43), { newPasswordConfirm: 'distinta' })).status).toBe(
      400,
    );
    expect((await reset(h.app, 'x'.repeat(43))).status).toBe(429);
  });
});
