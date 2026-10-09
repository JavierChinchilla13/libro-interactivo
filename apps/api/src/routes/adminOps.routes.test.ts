import {
  adminMessageListResponseSchema,
  adminStatsSchema,
  adminUserDetailSchema,
  adminUserListResponseSchema,
  adminUserSchema,
  apiErrorSchema,
  siteSettingsResponseSchema,
} from '@libro/shared';
import type { Types } from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ContactMessage } from '../models/ContactMessage.js';
import { ExtraAccess } from '../models/ExtraAccess.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User } from '../models/User.js';
import { UserProgress } from '../models/UserProgress.js';
import { staffWorld } from '../test-utils/admin.js';
import { PASSWORD, createUser, loginAgent, resetTokenFrom } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';
import { createAdminUsersService } from '../services/adminUsers.service.js';
import { ANONYMIZED_USER_ID } from '../services/userErasure.service.js';

useTestDb();

const READER_EMAIL = 'usuario@ejemplo.com';
const DAY = 86_400_000;

/** Un libro publicado con dos quizzes y la lectora de `staffWorld` con progreso real (intentos y avance). */
async function world() {
  const base = await staffWorld();
  const book = await createBook();
  const q1 = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: 'Quiz Uno' }),
    publishedBy: base.adminUser._id,
  });
  const q2 = await createQuiz({
    bookId: book._id,
    order: 2,
    content: simpleContent({ title: 'Quiz Dos' }),
    publishedBy: base.adminUser._id,
  });
  const readerDoc = await User.findOne({ email: READER_EMAIL }).orFail();
  const version = await QuizVersion.findOne({ quizId: q1._id }).orFail();
  const attempt = (over: Record<string, unknown> = {}) =>
    QuizAttempt.create({
      userId: readerDoc._id,
      bookId: book._id,
      quizId: q1._id,
      quizVersionId: version._id,
      version: 1,
      attemptNumber: 1,
      status: 'completed',
      finalResultKey: 'r1',
      isTest: false,
      startedAt: new Date(),
      completedAt: new Date(),
      ...over,
    });
  return { ...base, book, q1, q2, readerDoc, version, attempt };
}

describe('permisos: solo administradoras', () => {
  it('usuarios, mensajes, estadísticas y ajustes de contacto no se abren sin ser ADMIN', async () => {
    const { app, reader, editor, admin } = await world();
    const calls: [string, string][] = [
      ['get', '/api/admin/users'],
      ['get', '/api/admin/users/670000000000000000000001'],
      ['post', '/api/admin/users'],
      ['patch', '/api/admin/users/670000000000000000000001'],
      ['delete', '/api/admin/users/670000000000000000000001'],
      ['get', '/api/admin/contact-messages'],
      ['patch', '/api/admin/contact-messages/670000000000000000000001'],
      ['delete', '/api/admin/contact-messages/670000000000000000000001'],
      ['get', '/api/admin/stats'],
    ];
    for (const [method, path] of calls) {
      const anon = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[
        method
      ]!(path);
      expect(anon.status, `anónimo ${method} ${path}`).toBe(401);
      for (const who of [reader, editor]) {
        const res = await (who as unknown as Record<string, (p: string) => request.Test>)[method]!(
          path,
        );
        expect(res.status, `${method} ${path}`).toBe(403);
      }
    }
    await admin.get('/api/admin/users').expect(200);
    await admin.get('/api/admin/contact-messages').expect(200);
    await admin.get('/api/admin/stats').expect(200);
  });
});

describe('usuarios: lista y detalle', () => {
  it('lista con rol, estado y progreso, sin datos sensibles, con búsqueda sin acentos y filtros', async () => {
    const { admin, readerDoc, book, q1 } = await world();
    await createUser({ email: 'maria@ejemplo.com', name: 'María Acuña' });
    await createUser({ email: 'off@ejemplo.com', name: 'Cuenta Apagada', status: 'disabled' });
    await UserProgress.create({
      userId: readerDoc._id,
      bookId: book._id,
      completed: [
        { kind: 'quiz', refId: q1._id, firstCompletedAt: new Date(), currentAttemptId: q1._id },
      ],
    });
    const res = await admin.get('/api/admin/users').expect(200);
    const list = adminUserListResponseSchema.parse(res.body);
    expect(list.total).toBe(5);
    expect(list.totalQuizzes).toBe(2);
    expect(list.users.find((u) => u.email === READER_EMAIL)?.completedQuizzes).toBe(1);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|tokenVersion|failedLogin/);
    expect(res.headers['cache-control']).toBe('no-store');

    const names = async (qs: string) =>
      adminUserListResponseSchema
        .parse((await admin.get(`/api/admin/users${qs}`).expect(200)).body)
        .users.map((u) => u.name);
    expect(await names('?q=MARIA')).toEqual(['María Acuña']);
    expect(await names('?q=off@')).toEqual(['Cuenta Apagada']);
    expect(await names('?status=disabled')).toEqual(['Cuenta Apagada']);
    expect((await names('?role=EDITOR')).length).toBe(1);
    expect(await names('?q=.*')).toEqual([]);
  });

  it('pagina sin repetir ni saltar', async () => {
    const { admin } = await world();
    for (let i = 0; i < 4; i++)
      await createUser({ email: `l${i}@ejemplo.com`, name: `Lector ${i}` });
    const page = async (n: number) =>
      adminUserListResponseSchema
        .parse((await admin.get(`/api/admin/users?pageSize=3&page=${n}`).expect(200)).body)
        .users.map((u) => u.id);
    const [a, b, c] = [await page(1), await page(2), await page(3)];
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    expect(c).toHaveLength(1);
    expect(new Set([...a, ...b]).size).toBe(6);
    await admin.get('/api/admin/users?pageSize=500').expect(400);
  });

  it('el detalle muestra completados con su resultado, lo desbloqueado con QR y los intentos sin pruebas', async () => {
    const { admin, readerDoc, book, q1, q2, attempt } = await world();
    const done = await attempt();
    await attempt({ attemptNumber: 2 });
    await attempt({ attemptNumber: 3, isTest: true });
    await UserProgress.create({
      userId: readerDoc._id,
      bookId: book._id,
      completed: [
        {
          kind: 'quiz',
          refId: q1._id,
          firstCompletedAt: new Date('2026-10-01T10:00:00Z'),
          currentAttemptId: done._id,
          currentResultKey: 'r1',
        },
      ],
      unlocked: [{ kind: 'quiz', refId: q2._id, at: new Date() }],
    });
    const res = await admin.get(`/api/admin/users/${readerDoc._id}`).expect(200);
    const detail = adminUserDetailSchema.parse(res.body);
    const rows = detail.books[0]?.quizzes ?? [];
    expect(rows.map((r) => [r.title, r.status, r.attempts])).toEqual([
      ['Quiz Uno', 'completed', 2],
      ['Quiz Dos', 'unlocked', 0],
    ]);
    expect(rows[0]?.resultTitle).toBeTruthy();
    expect(rows[0]?.completedAt).toBe('2026-10-01T10:00:00.000Z');
    expect(detail.user.completedQuizzes).toBe(1);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    await admin.get('/api/admin/users/670000000000000000000001').expect(404);
    await admin.get('/api/admin/users/no-es-id').expect(400);
  });
});

describe('usuarios: crear cuentas de administración', () => {
  it('crea una editora que elige su contraseña con el enlace del correo', async () => {
    const { admin, app, flush, mail } = await world();
    const res = await admin
      .post('/api/admin/users')
      .send({ name: 'Nueva Editora', email: 'Nueva@Ejemplo.com', role: 'EDITOR' })
      .expect(201);
    expect(adminUserSchema.parse(res.body)).toMatchObject({ role: 'EDITOR', status: 'active' });
    await flush();
    const invite = mail.sent.find((m) => m.to === 'nueva@ejemplo.com');
    expect(invite).toBeTruthy();
    const token = resetTokenFrom(invite?.text ?? '');
    // Antes de elegir contraseña nadie puede entrar con una adivinada.
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nueva@ejemplo.com', password: PASSWORD })
      .expect(401);
    await request(app)
      .post('/api/auth/reset-password')
      .send({
        token,
        newPassword: 'Cielo-Verde-Nueve-52',
        newPasswordConfirm: 'Cielo-Verde-Nueve-52',
      })
      .expect(200);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nueva@ejemplo.com', password: 'Cielo-Verde-Nueve-52' })
      .expect(200);
    expect(login.body.user.role).toBe('EDITOR');
  });

  it('rechaza un correo repetido (409), el rol de lector y datos inválidos', async () => {
    const { admin } = await world();
    const dup = await admin
      .post('/api/admin/users')
      .send({ name: 'Otra', email: READER_EMAIL, role: 'ADMIN' });
    expect(dup.status).toBe(409);
    for (const bad of [
      { name: 'Ana', email: 'ana@ejemplo.com', role: 'USER' },
      { name: 'Ana', email: 'no-es-correo', role: 'EDITOR' },
      { name: 'A', email: 'a@ejemplo.com', role: 'EDITOR' },
      { email: 'a@ejemplo.com', role: 'EDITOR' },
    ]) {
      expect((await admin.post('/api/admin/users').send(bad)).status, JSON.stringify(bad)).toBe(
        400,
      );
    }
  });
});

describe('usuarios: rol y estado', () => {
  it('desactivar cierra las sesiones y bloquea el ingreso; reactivar lo devuelve', async () => {
    const { admin, app, reader, readerDoc } = await world();
    await reader.get('/api/me').expect(200);
    const res = await admin
      .patch(`/api/admin/users/${readerDoc._id}`)
      .send({ status: 'disabled' })
      .expect(200);
    expect(adminUserSchema.parse(res.body).status).toBe('disabled');
    expect((await reader.get('/api/me')).status).toBe(401);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: READER_EMAIL, password: PASSWORD });
    expect(login.status).toBe(401);
    await admin.patch(`/api/admin/users/${readerDoc._id}`).send({ status: 'active' }).expect(200);
    await request(app)
      .post('/api/auth/login')
      .send({ email: READER_EMAIL, password: PASSWORD })
      .expect(200);
  });

  it('cambiar el rol aplica de inmediato y cierra sus sesiones', async () => {
    const { admin, app, reader, readerDoc } = await world();
    expect((await reader.get('/api/admin/books')).status).toBe(403);
    await admin.patch(`/api/admin/users/${readerDoc._id}`).send({ role: 'EDITOR' }).expect(200);
    expect((await reader.get('/api/me')).status).toBe(401); // sesión anterior cerrada
    const relogin = await loginAgent(app, READER_EMAIL);
    await relogin.get('/api/admin/books').expect(200);
  });

  it('nadie cambia su propio rol ni se desactiva', async () => {
    const { admin, adminUser } = await world();
    for (const body of [{ role: 'EDITOR' }, { status: 'disabled' }]) {
      const res = await admin.patch(`/api/admin/users/${adminUser._id}`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(403);
    }
    expect((await User.findById(adminUser._id).orFail()).role).toBe('ADMIN');
  });

  it('siempre queda una administradora activa (también si otra persona intenta quitarle el rol a la última)', async () => {
    const { adminUser, editorUser } = await world();
    const service = createAdminUsersService({
      auth: { revokeAllSessions: async () => undefined } as never,
      passwordReset: { requestReset: async () => undefined } as never,
    });
    // `editorUser` no es administradora: simula una acción (p. ej. simultánea) sobre la única administradora.
    await expect(
      service.update(String(editorUser._id), String(adminUser._id), { role: 'USER' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      service.update(String(editorUser._id), String(adminUser._id), { status: 'disabled' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect((await User.findById(adminUser._id).orFail()).role).toBe('ADMIN');
  });

  it('con otra administradora activa sí se puede quitar el rol', async () => {
    const { admin } = await world();
    const second = await createUser({ email: 'segunda@ejemplo.com', role: 'ADMIN' });
    await admin.patch(`/api/admin/users/${second._id}`).send({ role: 'EDITOR' }).expect(200);
  });

  it('valida el cuerpo y el id', async () => {
    const { admin, readerDoc } = await world();
    for (const body of [{}, { role: 'DIOS' }, { status: 'borrado' }]) {
      expect((await admin.patch(`/api/admin/users/${readerDoc._id}`).send(body)).status).toBe(400);
    }
    await admin
      .patch('/api/admin/users/670000000000000000000001')
      .send({ role: 'EDITOR' })
      .expect(404);
  });
});

describe('eliminar cuentas y datos personales', () => {
  async function withData() {
    const w = await world();
    const done = await w.attempt();
    await w.attempt({
      attemptNumber: 2,
      status: 'in_progress',
      finalResultKey: undefined,
      completedAt: undefined,
    });
    await UserProgress.create({
      userId: w.readerDoc._id,
      bookId: w.book._id,
      completed: [
        { kind: 'quiz', refId: w.q1._id, firstCompletedAt: new Date(), currentAttemptId: done._id },
      ],
    });
    await ExtraAccess.create({
      userId: w.readerDoc._id,
      extraId: w.q1._id,
      bookId: w.book._id,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      viewCount: 1,
    });
    await PasswordReset.create({
      userId: w.readerDoc._id,
      tokenHash: 'hash-prueba',
      expiresAt: new Date(Date.now() + DAY),
    });
    return w;
  }
  async function expectErased(userId: Types.ObjectId) {
    expect(await User.findById(userId)).toBeNull();
    expect(await UserProgress.countDocuments({ userId })).toBe(0);
    expect(await ExtraAccess.countDocuments({ userId })).toBe(0);
    expect(await PasswordReset.countDocuments({ userId })).toBe(0);
    expect(await RefreshToken.countDocuments({ userId })).toBe(0);
    expect(await QuizAttempt.countDocuments({ userId })).toBe(0);
    // El intento completado se conserva anonimizado; el que estaba en curso se elimina.
    const kept = await QuizAttempt.find({ userId: ANONYMIZED_USER_ID }).lean();
    expect(kept).toHaveLength(1);
    expect(kept[0]?.status).toBe('completed');
  }

  it('la administradora elimina a una lectora: se borran sus datos y sus intentos quedan anonimizados', async () => {
    const { admin, readerDoc } = await withData();
    await admin.delete(`/api/admin/users/${readerDoc._id}`).expect(204);
    await expectErased(readerDoc._id);
  });

  it('no elimina cuentas de administración (se desactivan), ni la propia, ni una inexistente', async () => {
    const { admin, adminUser, editorUser } = await world();
    const staff = await admin.delete(`/api/admin/users/${editorUser._id}`);
    expect(staff.status).toBe(400);
    expect(apiErrorSchema.parse(staff.body).error.message).toContain('desactívala');
    expect((await admin.delete(`/api/admin/users/${adminUser._id}`)).status).toBe(403);
    await admin.delete('/api/admin/users/670000000000000000000001').expect(404);
    expect(await User.countDocuments({ role: { $ne: 'USER' } })).toBe(2);
  });

  it('una lectora elimina su propia cuenta con su contraseña y se cierra su sesión', async () => {
    const { reader, readerDoc, app } = await withData();
    const wrong = await reader.delete('/api/me').send({ password: 'otra-contraseña' });
    expect(wrong.status).toBe(400);
    expect(await User.findById(readerDoc._id)).not.toBeNull();
    const res = await reader.delete('/api/me').send({ password: PASSWORD });
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/libro_at=;/);
    await expectErased(readerDoc._id);
    await request(app)
      .post('/api/auth/login')
      .send({ email: READER_EMAIL, password: PASSWORD })
      .expect(401);
  });

  it('el borrado propio exige sesión y contraseña, y una cuenta de administración no lo hace por ahí', async () => {
    const { app, editor, admin } = await world();
    await request(app).delete('/api/me').send({ password: PASSWORD }).expect(401);
    expect((await editor.delete('/api/me').send({})).status).toBe(400);
    for (const staff of [editor, admin]) {
      expect((await staff.delete('/api/me').send({ password: PASSWORD })).status).toBe(403);
    }
    expect(await User.countDocuments({ role: { $ne: 'USER' } })).toBe(2);
  });
});

describe('mensajes de contacto', () => {
  const make = (over: Record<string, unknown> = {}) =>
    ContactMessage.create({
      name: 'Visitante',
      email: 'visita@ejemplo.com',
      message: 'Hola, ¿habrá segunda parte?',
      emailSent: true,
      ...over,
    });

  it('lista los mensajes con filtro, conteo de pendientes y paginación', async () => {
    const { admin } = await world();
    await make({ name: 'Uno', createdAt: new Date(Date.now() - 3000) });
    await make({
      name: 'Dos',
      handled: true,
      handledAt: new Date(),
      createdAt: new Date(Date.now() - 2000),
    });
    await make({ name: 'Tres', createdAt: new Date(Date.now() - 1000) });
    const get = async (qs: string) =>
      adminMessageListResponseSchema.parse(
        (await admin.get(`/api/admin/contact-messages${qs}`).expect(200)).body,
      );
    const all = await get('');
    expect(all.messages.map((m) => m.name)).toEqual(['Tres', 'Dos', 'Uno']);
    expect(all.unhandled).toBe(2);
    expect((await get('?status=unhandled')).messages.map((m) => m.name)).toEqual(['Tres', 'Uno']);
    expect((await get('?status=handled')).messages.map((m) => m.name)).toEqual(['Dos']);
    expect((await get('?pageSize=2&page=2')).messages.map((m) => m.name)).toEqual(['Uno']);
    await admin.get('/api/admin/contact-messages?status=otro').expect(400);
  });

  it('se marca como atendido (con quién y cuándo), se puede deshacer y se puede borrar', async () => {
    const { admin, adminUser } = await world();
    const message = await make();
    const done = await admin
      .patch(`/api/admin/contact-messages/${message._id}`)
      .send({ handled: true })
      .expect(200);
    expect(done.body).toMatchObject({ handled: true });
    expect(done.body.handledAt).toBeTruthy();
    expect(String((await ContactMessage.findById(message._id).orFail()).handledBy)).toBe(
      String(adminUser._id),
    );
    const undone = await admin
      .patch(`/api/admin/contact-messages/${message._id}`)
      .send({ handled: false })
      .expect(200);
    expect(undone.body.handled).toBe(false);
    expect(undone.body.handledAt).toBeUndefined();
    await admin.delete(`/api/admin/contact-messages/${message._id}`).expect(204);
    expect(await ContactMessage.countDocuments()).toBe(0);
    await admin.delete(`/api/admin/contact-messages/${message._id}`).expect(404);
    await admin
      .patch('/api/admin/contact-messages/670000000000000000000001')
      .send({ handled: true })
      .expect(404);
    await admin.patch(`/api/admin/contact-messages/${message._id}`).send({}).expect(400);
  });
});

describe('estadísticas', () => {
  it('cuenta lectores, intentos reales y la distribución por resultado, sin las pruebas', async () => {
    const { admin, readerDoc, attempt, q1, book, version } = await world();
    const day = (n: number) => new Date(Date.now() - n * DAY);
    const old = await createUser({ email: 'vieja@ejemplo.com' });
    await User.collection.updateOne({ _id: old._id }, { $set: { createdAt: day(20) } });
    const ancient = await createUser({ email: 'antigua@ejemplo.com', status: 'disabled' });
    await User.collection.updateOne({ _id: ancient._id }, { $set: { createdAt: day(90) } });

    await attempt({ finalResultKey: 'r1' });
    await attempt({ attemptNumber: 2, finalResultKey: 'r1' }); // misma persona, otro intento
    await attempt({ userId: old._id, finalResultKey: 'r2' });
    await attempt({ userId: ANONYMIZED_USER_ID, finalResultKey: 'r2' });
    await attempt({ attemptNumber: 9, finalResultKey: 'r3', isTest: true }); // prueba: no cuenta
    await attempt({
      status: 'in_progress',
      attemptNumber: 5,
      finalResultKey: undefined,
      completedAt: undefined,
    });
    await UserProgress.create({
      userId: readerDoc._id,
      bookId: book._id,
      bookCompletedAt: new Date(),
    });
    await ContactMessage.create({
      name: 'V',
      email: 'v@ejemplo.com',
      message: 'Hola hola hola',
      handled: false,
    });
    await ContactMessage.create({
      name: 'W',
      email: 'w@ejemplo.com',
      message: 'Hola hola hola',
      handled: true,
    });

    const stats = adminStatsSchema.parse((await admin.get('/api/admin/stats').expect(200)).body);
    expect(stats.readers).toEqual({ total: 3, last7Days: 1, last30Days: 2, disabled: 1 });
    expect(stats.staff).toBe(2);
    expect(stats.attempts).toEqual({ completed: 4, inProgress: 1 });
    expect(stats.booksCompleted).toBe(1);
    expect(stats.unhandledMessages).toBe(1);
    const quiz = stats.quizzes.find((q) => String(q.quizId) === String(q1._id));
    expect(quiz).toMatchObject({ title: 'Quiz Uno', attempts: 4, completedUsers: 3 });
    expect(quiz?.results.map((r) => [r.key, r.count])).toEqual([
      ['r1', 2],
      ['r2', 2],
    ]);
    // El título sale de la versión publicada del quiz.
    const titles = ((version.results ?? []) as { key: string; title: string }[]).map(
      (r) => r.title,
    );
    expect(quiz?.results.every((r) => titles.includes(r.title))).toBe(true);
    expect(JSON.stringify(stats)).not.toContain('r3');
  });
});

describe('ajustes de contacto (solo administradoras)', () => {
  it('la administradora ve y cambia el correo de recepción, guardar y retención; la editora no lo ve ni lo cambia', async () => {
    const { admin, editor } = await world();
    const initial = siteSettingsResponseSchema.parse(
      (await admin.get('/api/admin/site-settings').expect(200)).body,
    );
    expect(initial.contact).toEqual({ storeMessages: true, retentionDays: 365 });
    const forEditor = (await editor.get('/api/admin/site-settings').expect(200)).body;
    expect(forEditor).not.toHaveProperty('contact');

    const body = {
      contact: { recipientEmail: 'autora@ejemplo.com', storeMessages: false, retentionDays: 90 },
    };
    expect((await editor.patch('/api/admin/site-settings').send(body)).status).toBe(403);
    const saved = siteSettingsResponseSchema.parse(
      (await admin.patch('/api/admin/site-settings').send(body).expect(200)).body,
    );
    expect(saved.contact).toEqual(body.contact);
    // Quitar el correo vuelve al configurado por el desarrollador.
    const cleared = siteSettingsResponseSchema.parse(
      (
        await admin
          .patch('/api/admin/site-settings')
          .send({ contact: { storeMessages: true, retentionDays: 365 } })
          .expect(200)
      ).body,
    );
    expect(cleared.contact).toEqual({ storeMessages: true, retentionDays: 365 });
  });

  it('valida el correo y la retención, y nada del contacto sale en lo público', async () => {
    const { admin, app } = await world();
    for (const contact of [
      { recipientEmail: 'no-es-correo', storeMessages: true, retentionDays: 30 },
      { storeMessages: true, retentionDays: 0 },
      { storeMessages: true, retentionDays: 4000 },
      { storeMessages: 'sí', retentionDays: 30 },
    ]) {
      expect((await admin.patch('/api/admin/site-settings').send({ contact })).status).toBe(400);
    }
    await admin
      .patch('/api/admin/site-settings')
      .send({
        contact: { recipientEmail: 'privado@ejemplo.com', storeMessages: true, retentionDays: 30 },
      })
      .expect(200);
    const text = JSON.stringify((await request(app).get('/api/site').expect(200)).body);
    expect(text).not.toMatch(/privado@|recipientEmail|retentionDays/);
  });

  it('el correo configurado en el panel es adonde llegan los mensajes del formulario', async () => {
    const { admin, app, flush, mail } = await world();
    await admin
      .patch('/api/admin/site-settings')
      .send({
        contact: { recipientEmail: 'destino@ejemplo.com', storeMessages: true, retentionDays: 30 },
      })
      .expect(200);
    await request(app)
      .post('/api/contact')
      .send({
        name: 'Visitante Curioso',
        email: 'visita@ejemplo.com',
        message: 'Hola, me encantó el primer libro.',
        website: '',
        startedAt: Date.now() - 10_000,
      })
      .expect(202);
    await flush();
    expect(mail.sent.map((m) => m.to)).toContain('destino@ejemplo.com');
  });
});
