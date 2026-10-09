import {
  apiErrorSchema,
  progressResponseSchema,
  publicBookDetailSchema,
  publicBookListResponseSchema,
  siteSettingsResponseSchema,
  welcomeResponseSchema,
  type WelcomeSettings,
} from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Book } from '../models/Book.js';
import { UserProgress } from '../models/UserProgress.js';
import { image, staffWorld } from '../test-utils/admin.js';
import { loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const wait = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const welcome = (over: Partial<WelcomeSettings> = {}): WelcomeSettings => ({
  enabled: true,
  title: '[PLACEHOLDER] Bienvenida',
  bodyHtml: '<p>[PLACEHOLDER] El pacto con el lector</p>',
  showMode: 'every_login',
  ...over,
});

describe('GET /api/books (público)', () => {
  it('lista solo libros publicados y «próximamente», por orden, sin sesión y sin spoilers', async () => {
    const { app, adminUser } = await staffWorld();
    const mk = (
      slug: string,
      order: number,
      status: 'draft' | 'upcoming' | 'published' | 'archived',
    ) =>
      Book.create({
        slug,
        title: `[PLACEHOLDER] ${slug}`,
        order,
        status,
        cover: image(slug),
        synopsis: '<p>Sinopsis</p>',
      });
    await mk('borrador', 1, 'draft');
    const dos = await mk('libro-2', 3, 'upcoming');
    const uno = await mk('libro-1', 2, 'published');
    await mk('archivado', 4, 'archived');
    await createQuiz({
      bookId: uno._id,
      order: 1,
      content: simpleContent({ title: 'QUIZ-SECRETO' }),
      publishedBy: adminUser._id,
    });
    await Book.updateOne(
      { _id: dos._id },
      { $set: { releaseDate: new Date('2027-03-01T00:00:00Z') } },
    );

    const res = await request(app).get('/api/books').expect(200);
    const list = publicBookListResponseSchema.parse(res.body);
    expect(list.books.map((b) => [b.slug, b.status])).toEqual([
      ['libro-1', 'published'],
      ['libro-2', 'upcoming'],
    ]);
    expect(list.books[1]?.releaseDate).toBe('2027-03-01');
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    expect(JSON.stringify(res.body)).not.toMatch(
      /SECRETO|synopsis|wikiSections|borrador|archivado/,
    );
  });

  it('el detalle trae sinopsis, géneros, advertencia, edad, ISBN, compra y tema; borrador/archivado/inexistente dan 404', async () => {
    const { app } = await staffWorld();
    await Book.create({
      slug: 'libro-1',
      title: '[PLACEHOLDER] Libro 1',
      order: 1,
      status: 'published',
      synopsis: '<p>Sinopsis</p>',
      genres: ['distopía'],
      contentWarning: '<p>Aviso</p>',
      minAge: 16,
      isbn: '978-0',
      cover: image('c'),
      purchaseLinks: [{ region: 'CR', kind: 'store', label: 'Compras presenciales' }],
      theme: { primaryColor: '#444444', background: { type: 'color', color: '#f4f4f4' } },
      wikiSections: [
        { kind: 'character', title: 'Personajes', order: 1, enabled: true, lockedMessage: 'x' },
      ],
    });
    await Book.create({ slug: 'oculto', title: 'Oculto', order: 2, status: 'draft' });
    const detail = publicBookDetailSchema.parse(
      (await request(app).get('/api/books/libro-1').expect(200)).body,
    );
    expect(detail).toMatchObject({
      genres: ['distopía'],
      minAge: 16,
      isbn: '978-0',
      contentWarning: '<p>Aviso</p>',
    });
    expect(detail.purchaseLinks).toHaveLength(1);
    expect(JSON.stringify(detail)).not.toMatch(/wikiSections|lockedMessage/);
    expect((await request(app).get('/api/books/oculto')).status).toBe(404);
    expect((await request(app).get('/api/books/no-existe')).status).toBe(404);
  });
});

describe('mensaje de bienvenida', () => {
  it('los ajustes del panel exigen sesión y rol de editora o administradora', async () => {
    const { app, reader, editor, admin } = await staffWorld();
    await request(app).get('/api/admin/site-settings').expect(401);
    expect((await reader.get('/api/admin/site-settings')).status).toBe(403);
    expect(
      (await reader.patch('/api/admin/site-settings').send({ welcome: welcome() })).status,
    ).toBe(403);
    await editor.get('/api/admin/site-settings').expect(200);
    await admin.patch('/api/admin/site-settings').send({ welcome: welcome() }).expect(200);
  });

  it('por defecto está apagado y vacío: no se inventa texto', async () => {
    const { admin, reader } = await staffWorld();
    const settings = siteSettingsResponseSchema.parse(
      (await admin.get('/api/admin/site-settings').expect(200)).body,
    );
    expect(settings.welcome).toEqual({ enabled: false, bodyHtml: '', showMode: 'every_login' });
    expect(
      welcomeResponseSchema.parse((await reader.get('/api/me/welcome').expect(200)).body),
    ).toEqual({ show: false });
  });

  it('exige sesión para leerlo y marcarlo como visto', async () => {
    const { app } = await staffWorld();
    await request(app).get('/api/me/welcome').expect(401);
    await request(app).post('/api/me/welcome-seen').expect(401);
  });

  it('guarda y sanea el texto; activarlo sin texto se rechaza', async () => {
    const { editor } = await staffWorld();
    const empty = await editor
      .patch('/api/admin/site-settings')
      .send({ welcome: welcome({ bodyHtml: '<script>alert(1)</script>' }) });
    expect(empty.status).toBe(400);
    expect(apiErrorSchema.parse(empty.body).error.code).toBe('VALIDATION');

    const saved = siteSettingsResponseSchema.parse(
      (
        await editor
          .patch('/api/admin/site-settings')
          .send({
            welcome: welcome({
              bodyHtml: '<p>Hola</p><script>alert(1)</script><img src=x onerror=alert(1)>',
            }),
          })
          .expect(200)
      ).body,
    );
    expect(saved.welcome.bodyHtml).toBe('<p>Hola</p>');
    // Apagarlo sin texto es válido, y quitar el título lo borra.
    const off = siteSettingsResponseSchema.parse(
      (
        await editor
          .patch('/api/admin/site-settings')
          .send({ welcome: { enabled: false, bodyHtml: '', showMode: 'first_login' } })
          .expect(200)
      ).body,
    );
    expect(off.welcome).toEqual({ enabled: false, bodyHtml: '', showMode: 'first_login' });
  });

  it('valida el cuerpo (modo desconocido, título largo)', async () => {
    const { editor } = await staffWorld();
    expect(
      (
        await editor
          .patch('/api/admin/site-settings')
          .send({ welcome: { ...welcome(), showMode: 'siempre' } })
      ).status,
    ).toBe(400);
    expect(
      (
        await editor
          .patch('/api/admin/site-settings')
          .send({ welcome: welcome({ title: 'x'.repeat(200) }) })
      ).status,
    ).toBe(400);
    expect((await editor.patch('/api/admin/site-settings').send({})).status).toBe(400);
  });

  it('«en cada ingreso»: se muestra, al marcarlo visto desaparece y vuelve en el siguiente ingreso', async () => {
    const { app, admin, reader } = await staffWorld();
    await admin.patch('/api/admin/site-settings').send({ welcome: welcome() }).expect(200);

    const first = welcomeResponseSchema.parse(
      (await reader.get('/api/me/welcome').expect(200)).body,
    );
    expect(first).toEqual({
      show: true,
      title: '[PLACEHOLDER] Bienvenida',
      bodyHtml: '<p>[PLACEHOLDER] El pacto con el lector</p>',
    });
    await wait();
    await reader.post('/api/me/welcome-seen').expect(204);
    expect(
      welcomeResponseSchema.parse((await reader.get('/api/me/welcome').expect(200)).body),
    ).toEqual({ show: false });

    await wait();
    const again = await loginAgent(app); // un ingreso nuevo
    expect(
      welcomeResponseSchema.parse((await again.get('/api/me/welcome').expect(200)).body).show,
    ).toBe(true);
  });

  it('«solo la primera vez»: después de verlo no vuelve aunque inicie sesión de nuevo', async () => {
    const { app, admin, reader } = await staffWorld();
    await admin
      .patch('/api/admin/site-settings')
      .send({ welcome: welcome({ showMode: 'first_login' }) })
      .expect(200);
    expect(
      welcomeResponseSchema.parse((await reader.get('/api/me/welcome').expect(200)).body).show,
    ).toBe(true);
    await wait();
    await reader.post('/api/me/welcome-seen').expect(204);
    await wait();
    const again = await loginAgent(app);
    expect(
      welcomeResponseSchema.parse((await again.get('/api/me/welcome').expect(200)).body),
    ).toEqual({ show: false });
  });

  it('apagado no se muestra a nadie, y cambiarlo se nota en el siguiente ingreso de otra persona', async () => {
    const { admin, reader, editor } = await staffWorld();
    await admin
      .patch('/api/admin/site-settings')
      .send({ welcome: welcome({ enabled: false }) })
      .expect(200);
    expect(
      welcomeResponseSchema.parse((await reader.get('/api/me/welcome').expect(200)).body).show,
    ).toBe(false);
    await admin.patch('/api/admin/site-settings').send({ welcome: welcome() }).expect(200);
    expect(
      welcomeResponseSchema.parse((await editor.get('/api/me/welcome').expect(200)).body).show,
    ).toBe(true);
  });
});

describe('GET /api/me/progress: por qué está bloqueado cada quiz', () => {
  it('distingue «falta completar el anterior» (con su nombre) de «aún no escaneaste el QR»', async () => {
    const { reader, adminUser } = await staffWorld({ env: { REQUIRE_QR_UNLOCK: 'true' } });
    const book = await createBook();
    const q1 = await createQuiz({
      bookId: book._id,
      order: 1,
      content: simpleContent({ title: '[PLACEHOLDER] Primero' }),
      publishedBy: adminUser._id,
    });
    await createQuiz({
      bookId: book._id,
      order: 2,
      content: simpleContent({ title: '[PLACEHOLDER] Segundo' }),
      publishedBy: adminUser._id,
    });
    await createQuiz({
      bookId: book._id,
      order: 3,
      content: simpleContent({ title: '[PLACEHOLDER] Tercero' }),
      publishedBy: adminUser._id,
    });
    const read = async () =>
      progressResponseSchema.parse(
        (await reader.get('/api/me/progress').query({ bookId: book._id.toString() }).expect(200))
          .body,
      ).experiences;

    // Nada escaneado: el 1.º espera su QR; el 2.º y el 3.º esperan al primero que falta.
    expect((await read()).map((e) => e.lockedBy)).toEqual([
      { reason: 'qr' },
      { reason: 'order', waitingFor: '[PLACEHOLDER] Primero' },
      { reason: 'order', waitingFor: '[PLACEHOLDER] Primero' },
    ]);

    const user = await (
      await import('../models/User.js')
    ).User.findOne({ emailNormalized: 'usuario@ejemplo.com' }).lean();
    await UserProgress.create({
      userId: user?._id,
      bookId: book._id,
      unlocked: [{ kind: 'quiz', refId: q1._id, at: new Date() }],
      completed: [
        { kind: 'quiz', refId: q1._id, firstCompletedAt: new Date(), currentAttemptId: q1._id },
      ],
    });
    // El 1.º ya está completo; el 2.º está bloqueado solo por falta de QR; el 3.º espera al 2.º.
    const after = await read();
    expect(after.map((e) => e.status)).toEqual(['completed', 'locked', 'locked']);
    expect(after.map((e) => e.lockedBy)).toEqual([
      undefined,
      { reason: 'qr' },
      { reason: 'order', waitingFor: '[PLACEHOLDER] Segundo' },
    ]);
  });

  it('un quiz disponible o completado no trae motivo de bloqueo', async () => {
    const { reader, adminUser } = await staffWorld();
    const book = await createBook();
    await createQuiz({
      bookId: book._id,
      order: 1,
      content: simpleContent(),
      publishedBy: adminUser._id,
    });
    const experiences = progressResponseSchema.parse(
      (await reader.get('/api/me/progress').query({ bookId: book._id.toString() }).expect(200))
        .body,
    ).experiences;
    expect(experiences[0]).toMatchObject({ status: 'available' });
    expect(experiences[0]).not.toHaveProperty('lockedBy');
  });
});
