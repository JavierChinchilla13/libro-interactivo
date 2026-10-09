import {
  apiErrorSchema,
  publicBookDetailSchema,
  publicSiteResponseSchema,
  siteSettingsResponseSchema,
  type UpdateSiteSettingsRequest,
} from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Book } from '../models/Book.js';
import { SiteSettings } from '../models/SiteSettings.js';
import { image, staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';
import { createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const full = (): UpdateSiteSettingsRequest => ({
  universe: {
    headline: '[PLACEHOLDER] Frase principal',
    introHtml: '<p>[PLACEHOLDER] ¿Qué es?</p><script>alert(1)</script>',
  },
  author: {
    name: '[PLACEHOLDER] Autora',
    bioHtml: '<p>Bio</p><img src=x onerror=alert(1)>',
    photo: image('autora'),
    publicEmail: 'autora@ejemplo.com',
  },
  social: [{ label: 'Instagram', url: 'https://instagram.com/placeholder' }],
  lock: { message: '[PLACEHOLDER] Sigue leyendo' },
});

describe('GET /api/site (público)', () => {
  it('sin configurar entrega vacíos y el texto de bloqueo por defecto, sin inventar contenido', async () => {
    const { app } = await staffWorld();
    const res = await request(app).get('/api/site').expect(200);
    expect(publicSiteResponseSchema.parse(res.body)).toEqual({
      universe: { introHtml: '' },
      author: { bioHtml: '' },
      social: [],
      lockMessage: 'Bloqueado: avanza en tu lectura',
    });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('entrega lo que guardó la autora (saneado) y nunca la bienvenida ni el correo de recepción', async () => {
    const { app, admin } = await staffWorld();
    await SiteSettings.updateOne(
      { key: 'site' },
      { $set: { 'contact.recipientEmail': 'privado@ejemplo.com' } },
      { upsert: true },
    );
    await admin
      .patch('/api/admin/site-settings')
      .send({
        ...full(),
        welcome: {
          enabled: true,
          title: 'TITULO-BIENVENIDA',
          bodyHtml: '<p>TEXTO-BIENVENIDA</p>',
          showMode: 'every_login',
        },
      })
      .expect(200);

    const res = await request(app).get('/api/site').expect(200);
    const site = publicSiteResponseSchema.parse(res.body);
    expect(site.universe).toEqual({
      headline: '[PLACEHOLDER] Frase principal',
      introHtml: '<p>[PLACEHOLDER] ¿Qué es?</p>',
    });
    expect(site.author.bioHtml).toBe('<p>Bio</p>');
    expect(site.author).toMatchObject({
      name: '[PLACEHOLDER] Autora',
      publicEmail: 'autora@ejemplo.com',
    });
    expect(site.social).toEqual([{ label: 'Instagram', url: 'https://instagram.com/placeholder' }]);
    expect(site.lockMessage).toBe('[PLACEHOLDER] Sigue leyendo');
    expect(JSON.stringify(res.body)).not.toMatch(
      /BIENVENIDA|privado@|recipientEmail|script|onerror/,
    );
  });
});

describe('PATCH /api/admin/site-settings (secciones)', () => {
  it('guarda cada sección por separado sin tocar las demás', async () => {
    const { admin } = await staffWorld();
    await admin.patch('/api/admin/site-settings').send(full()).expect(200);
    const after = siteSettingsResponseSchema.parse(
      (
        await admin
          .patch('/api/admin/site-settings')
          .send({ lock: { message: 'Otro texto' } })
          .expect(200)
      ).body,
    );
    expect(after.lock.message).toBe('Otro texto');
    expect(after.universe.headline).toBe('[PLACEHOLDER] Frase principal');
    expect(after.author.name).toBe('[PLACEHOLDER] Autora');
    expect(after.social).toHaveLength(1);
  });

  it('un texto opcional vacío lo quita, y quitar la foto la borra', async () => {
    const { admin } = await staffWorld();
    await admin.patch('/api/admin/site-settings').send(full()).expect(200);
    const after = siteSettingsResponseSchema.parse(
      (
        await admin
          .patch('/api/admin/site-settings')
          .send({ author: { bioHtml: '', name: '' }, lock: {}, universe: { introHtml: '' } })
          .expect(200)
      ).body,
    );
    expect(after.author).toEqual({ bioHtml: '' });
    expect(after.lock).toEqual({});
    expect(after.universe).toEqual({ introHtml: '' });
  });

  it('rechaza enlaces que no son http(s), una foto que no es de Cloudinary y demasiadas redes', async () => {
    const { editor } = await staffWorld();
    const bad = (body: unknown) => editor.patch('/api/admin/site-settings').send(body as object);
    for (const url of ['javascript:alert(1)', 'data:text/html,hola', 'ftp://x.com/a']) {
      const res = await bad({ social: [{ label: 'Red', url }] });
      expect(res.status).toBe(400);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION');
    }
    expect(
      (
        await bad({
          author: { bioHtml: '', photo: image('x', { url: 'https://evil.example.com/a.png' }) },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await bad({
          social: Array.from({ length: 9 }, (_, i) => ({
            label: `Red ${i}`,
            url: 'https://ejemplo.com',
          })),
        })
      ).status,
    ).toBe(400);
    expect((await bad({ author: { bioHtml: '', publicEmail: 'no-es-correo' } })).status).toBe(400);
  });

  it('las lectoras no pueden editar y las editoras sí', async () => {
    const { reader, editor } = await staffWorld();
    expect((await reader.patch('/api/admin/site-settings').send(full())).status).toBe(403);
    await editor.patch('/api/admin/site-settings').send(full()).expect(200);
  });
});

describe('GET /api/books/:slug (landing: pestañas de la wiki y quizzes)', () => {
  it('las pestañas bloqueadas salen «bloqueadas» con su mensaje y sin referencias al quiz que las abre', async () => {
    const { app, adminUser } = await staffWorld();
    const book = await Book.create({
      slug: 'libro-1',
      title: '[PLACEHOLDER] Libro 1',
      order: 1,
      status: 'published',
      cover: image('c'),
      wikiSections: [
        {
          kind: 'term',
          title: 'Glosario',
          order: 4,
          enabled: true,
          lockedMessage: 'NO-SE-VE-ABIERTA',
        },
        {
          kind: 'character',
          title: 'Personajes',
          order: 1,
          enabled: true,
          unlockAfter: { kind: 'quiz', refId: '670000000000000000000099' },
          lockedMessage: '[PLACEHOLDER] Se habilita al avanzar',
          introHtml: '<p>INTRO-SECRETA</p>',
        },
        { kind: 'place', title: 'Lugares', order: 3, enabled: false },
      ],
    });
    await createQuiz({
      bookId: book._id,
      order: 1,
      content: simpleContent({ title: '[PLACEHOLDER] Quiz uno' }),
      publishedBy: adminUser._id,
    });
    await createQuiz({
      bookId: book._id,
      order: 2,
      slug: 'borrador',
      content: simpleContent({ title: 'QUIZ-EN-BORRADOR' }),
    });

    const res = await request(app).get('/api/books/libro-1').expect(200);
    const detail = publicBookDetailSchema.parse(res.body);
    expect(detail.wikiTabs).toEqual([
      {
        kind: 'character',
        title: 'Personajes',
        locked: true,
        lockedMessage: '[PLACEHOLDER] Se habilita al avanzar',
      },
      { kind: 'term', title: 'Glosario', locked: false },
    ]);
    expect(detail.experiences).toEqual([
      { kind: 'quiz', id: expect.any(String), order: 1, title: '[PLACEHOLDER] Quiz uno' },
    ]);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(
      /INTRO-SECRETA|NO-SE-VE-ABIERTA|QUIZ-EN-BORRADOR|670000000000000000000099|unlockAfter|questions|resultKey/,
    );
  });
});
