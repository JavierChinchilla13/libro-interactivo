import {
  apiErrorSchema,
  extraPreviewResponseSchema,
  extraResponseSchema,
  readerExtraResponseSchema,
  readerExtrasResponseSchema,
  type ExtraInputPayload,
} from '@libro/shared';
import type request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { configureCloudinaryAccount } from '../lib/images.js';
import { Extra } from '../models/Extra.js';
import { staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';
import { cardImageAsset, fakeImages } from '../test-utils/fakeImages.js';
import { playQuizToEnd } from '../test-utils/quizPlay.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();
afterEach(() => configureCloudinaryAccount({ production: false }));

const code = (res: request.Response) => apiErrorSchema.parse(res.body).error.code;
const message = (res: request.Response) => apiErrorSchema.parse(res.body).error.message;

const CLOUD = {
  CLOUDINARY_CLOUD_NAME: 'mi-cuenta',
  CLOUDINARY_API_KEY: '123456',
  CLOUDINARY_API_SECRET: 'secreto-de-prueba',
};
const PUBLIC_ID = 'libro/extra/AbCdEfGhIjKlMnOpQrSt';
const header = (over: Record<string, unknown> = {}) => ({
  provider: 'cloudinary' as const,
  publicId: PUBLIC_ID,
  url: `https://res.cloudinary.com/mi-cuenta/image/upload/v1/${PUBLIC_ID}.jpg`,
  width: 10,
  height: 10,
  alt: 'Una torre entre la niebla',
  ...over,
});

async function world() {
  const cloud = fakeImages([
    // Cloudinary dice el tamaño REAL: el panel puede mentir, el servidor no.
    cardImageAsset(PUBLIC_ID, { width: 2400, height: 1200, bytes: 40 * 1024 * 1024 }),
  ]);
  const w = await staffWorld({ env: CLOUD, images: cloud.provider });
  const book = await createBook();
  const bookId = book._id.toString();
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent(),
    publishedBy: w.adminUser._id,
  });
  const text = (over: Partial<ExtraInputPayload> = {}): ExtraInputPayload => ({
    bookId,
    slug: 'capitulo-con-imagen',
    title: '[PLACEHOLDER] Capítulo con imagen',
    kind: 'text',
    bodyHtml: '<p>[PLACEHOLDER] Texto del extra</p>',
    status: 'published',
    ...over,
  });
  const pdf = (over: Partial<ExtraInputPayload> = {}): ExtraInputPayload => {
    w.storage.putObject({ key: `extras/${bookId}/doc.pdf`, mime: 'application/pdf', size: 1000 });
    return {
      bookId,
      slug: 'pdf-con-imagen',
      title: '[PLACEHOLDER] PDF',
      kind: 'pdf',
      file: {
        storageKey: `extras/${bookId}/doc.pdf`,
        mime: 'application/pdf',
        size: 1000,
        originalName: 'doc.pdf',
      },
      status: 'published',
      ...over,
    };
  };
  const finishBook = () => playQuizToEnd(w.reader, quiz._id.toString());
  return { ...w, cloud, book, bookId, text, pdf, finishBook };
}

describe('imagen al inicio del extra · guardar', () => {
  it('se guarda en los tres tipos; las medidas son las que dice Cloudinary y la URL se arma desde el identificador', async () => {
    const { admin, text, pdf, cloud } = await world();
    const created = extraResponseSchema.parse(
      (
        await admin
          .post('/api/admin/extras')
          .send(text({ headerImage: header() }))
          .expect(201)
      ).body,
    );
    expect(created.headerImage).toMatchObject({
      provider: 'cloudinary',
      publicId: PUBLIC_ID,
      width: 2400,
      height: 1200,
      alt: 'Una torre entre la niebla',
      url: `https://res.cloudinary.com/mi-cuenta/image/upload/${PUBLIC_ID}.jpg`,
    });
    expect(cloud.provider.inspect).toHaveBeenCalledWith({ publicId: PUBLIC_ID, resource: 'image' });

    const withPdf = extraResponseSchema.parse(
      (
        await admin
          .post('/api/admin/extras')
          .send(pdf({ headerImage: header() }))
          .expect(201)
      ).body,
    );
    expect(withPdf.headerImage?.publicId).toBe(PUBLIC_ID);
    // En la base solo quedan los campos de la imagen (sin migración: los extras viejos no tienen el campo).
    const stored = await Extra.findById(created.id).lean();
    expect(Object.keys(stored?.headerImage ?? {}).sort()).toEqual(
      ['alt', 'height', 'publicId', 'url', 'width'].sort(),
    );
  });

  it('sin imagen no cambia nada: la respuesta no trae el campo y se puede editar un extra sin imagen', async () => {
    const { admin, text } = await world();
    const created = extraResponseSchema.parse(
      (await admin.post('/api/admin/extras').send(text()).expect(201)).body,
    );
    expect(created).not.toHaveProperty('headerImage');
    const edited = extraResponseSchema.parse(
      (
        await admin
          .put(`/api/admin/extras/${created.id}`)
          .send(text({ title: 'Otro título' }))
          .expect(200)
      ).body,
    );
    expect(edited.title).toBe('Otro título');
    expect(edited).not.toHaveProperty('headerImage');
  });

  it('el texto alternativo es obligatorio (también si solo son espacios)', async () => {
    const { admin, text } = await world();
    for (const alt of ['', '   ']) {
      const res = await admin
        .post('/api/admin/extras')
        .send(text({ headerImage: header({ alt }) }));
      expect(res.status).toBe(400);
      expect(code(res)).toBe('VALIDATION');
    }
    expect(await Extra.countDocuments()).toBe(0);
  });

  it('una URL de otra cuenta de Cloudinary o de otro sitio se rechaza', async () => {
    const { admin, text } = await world();
    for (const url of [
      `https://res.cloudinary.com/otra-cuenta/image/upload/${PUBLIC_ID}.jpg`,
      `https://ejemplo.com/${PUBLIC_ID}.jpg`,
    ]) {
      const res = await admin
        .post('/api/admin/extras')
        .send(text({ headerImage: header({ url }) }));
      expect(res.status).toBe(400);
      expect(message(res)).toMatch(/subirse con el panel/);
    }
    expect(await Extra.countDocuments()).toBe(0);
  });

  it('solo vale lo subido a la carpeta de los extras', async () => {
    const { admin, text, cloud } = await world();
    cloud.set(cardImageAsset('libro/cartas/AbCdEfGhIjKlMnOpQrSt'));
    const res = await admin.post('/api/admin/extras').send(
      text({
        headerImage: header({
          publicId: 'libro/cartas/AbCdEfGhIjKlMnOpQrSt',
          url: 'https://res.cloudinary.com/mi-cuenta/image/upload/libro/cartas/AbCdEfGhIjKlMnOpQrSt.jpg',
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(message(res)).toMatch(/carpeta de capítulos extra/);
  });

  it('Cloudinary debe tener la imagen (si no existe, se rechaza) y ser JPG, PNG o WebP', async () => {
    const { admin, text, cloud } = await world();
    const missing = 'libro/extra/NoExisteEnCloudinary1';
    const res = await admin.post('/api/admin/extras').send(
      text({
        headerImage: header({
          publicId: missing,
          url: `https://res.cloudinary.com/mi-cuenta/image/upload/${missing}.jpg`,
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect(message(res)).toMatch(/No encontramos esa imagen en Cloudinary/);

    const gif = 'libro/extra/UnGifQueSeAnima1234';
    cloud.set(cardImageAsset(gif, { format: 'gif' }));
    const bad = await admin.post('/api/admin/extras').send(
      text({
        headerImage: header({
          publicId: gif,
          url: `https://res.cloudinary.com/mi-cuenta/image/upload/${gif}.gif`,
        }),
      }),
    );
    expect(bad.status).toBe(400);
    expect(message(bad)).toMatch(/JPG, PNG o WebP/);
  });

  it('sin tope de peso: una imagen de 40 MB se guarda (el de Cloudinary lo aplica Cloudinary)', async () => {
    const { admin, text } = await world();
    await admin
      .post('/api/admin/extras')
      .send(text({ headerImage: header() }))
      .expect(201);
  });

  it('al editar se puede cambiar el texto alternativo sin volver a consultar a Cloudinary, y quitar la imagen', async () => {
    const { admin, text, cloud } = await world();
    const created = extraResponseSchema.parse(
      (
        await admin
          .post('/api/admin/extras')
          .send(text({ headerImage: header() }))
          .expect(201)
      ).body,
    );
    const calls = (cloud.provider.inspect as unknown as { mock: { calls: unknown[] } }).mock.calls
      .length;
    const same = extraResponseSchema.parse(
      (
        await admin
          .put(`/api/admin/extras/${created.id}`)
          .send(text({ headerImage: header({ alt: 'Otro texto alternativo' }) }))
          .expect(200)
      ).body,
    );
    expect(same.headerImage?.alt).toBe('Otro texto alternativo');
    expect(same.headerImage?.width).toBe(2400);
    expect(
      (cloud.provider.inspect as unknown as { mock: { calls: unknown[] } }).mock.calls,
    ).toHaveLength(calls);

    const removed = extraResponseSchema.parse(
      (await admin.put(`/api/admin/extras/${created.id}`).send(text()).expect(200)).body,
    );
    expect(removed).not.toHaveProperty('headerImage');
    expect((await Extra.findById(created.id).lean())?.headerImage?.publicId).toBeUndefined();
    // Nunca se borra nada de Cloudinary desde el API.
    expect(cloud.destroyed).toEqual([]);
  });

  it('los lectores no pueden guardar extras', async () => {
    const { reader, text } = await world();
    expect(
      (await reader.post('/api/admin/extras').send(text({ headerImage: header() }))).status,
    ).toBe(403);
  });
});

describe('imagen al inicio del extra · quién la ve', () => {
  it('NO sale en la lista de extras del lector (ni bloqueada ni completa)', async () => {
    const { admin, reader, text, bookId, finishBook } = await world();
    await admin
      .post('/api/admin/extras')
      .send(text({ headerImage: header() }))
      .expect(201);

    const locked = await reader.get('/api/extras').query({ bookId }).expect(200);
    expect(JSON.stringify(locked.body)).not.toContain('cloudinary');
    expect(JSON.stringify(locked.body)).not.toContain('headerImage');

    await finishBook();
    const open = await reader.get('/api/extras').query({ bookId }).expect(200);
    const list = readerExtrasResponseSchema.parse(open.body);
    expect(list.locked).toBe(false);
    expect(JSON.stringify(open.body)).not.toContain('cloudinary');
    expect(JSON.stringify(open.body)).not.toContain('headerImage');
  });

  it('con el libro incompleto el extra da 403 sin imagen ni URL; al completar, sale con medidas ajustadas y URL optimizada', async () => {
    const { admin, reader, text, finishBook } = await world();
    const created = extraResponseSchema.parse(
      (
        await admin
          .post('/api/admin/extras')
          .send(text({ headerImage: header() }))
          .expect(201)
      ).body,
    );

    const blocked = await reader.get(`/api/extras/${created.id}`);
    expect(blocked.status).toBe(403);
    expect(blocked.text).not.toContain('cloudinary');
    expect(blocked.text).not.toContain(PUBLIC_ID);

    await finishBook();
    const res = await reader.get(`/api/extras/${created.id}`).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const opened = readerExtraResponseSchema.parse(res.body);
    expect(opened.headerImage).toEqual({
      // Ancho acotado a 1600 con las medidas proporcionales (2400×1200 → 1600×800): la página no salta al cargar.
      url: `https://res.cloudinary.com/mi-cuenta/image/upload/f_auto,q_auto,c_limit,w_1600/${PUBLIC_ID}`,
      width: 1600,
      height: 800,
      alt: 'Una torre entre la niebla',
    });
    // Solo lo que hace falta para pintarla: ni el identificador suelto ni nada del panel.
    expect(Object.keys(opened.headerImage ?? {}).sort()).toEqual(['alt', 'height', 'url', 'width']);
  });

  it('también sale en un PDF y un extra sin imagen no trae el campo', async () => {
    const { admin, reader, text, pdf, finishBook } = await world();
    const withPdf = extraResponseSchema.parse(
      (
        await admin
          .post('/api/admin/extras')
          .send(pdf({ headerImage: header() }))
          .expect(201)
      ).body,
    );
    const plain = extraResponseSchema.parse(
      (
        await admin
          .post('/api/admin/extras')
          .send(text({ slug: 'sin-imagen' }))
          .expect(201)
      ).body,
    );
    await finishBook();
    const a = readerExtraResponseSchema.parse(
      (await reader.get(`/api/extras/${withPdf.id}`).expect(200)).body,
    );
    expect(a.kind).toBe('pdf');
    expect(a.headerImage?.alt).toBe('Una torre entre la niebla');
    const b = await reader.get(`/api/extras/${plain.id}`).expect(200);
    expect(b.body).not.toHaveProperty('headerImage');
  });

  it('la vista previa de la autora la muestra sin haber completado el libro', async () => {
    const { admin, text } = await world();
    const created = extraResponseSchema.parse(
      (
        await admin
          .post('/api/admin/extras')
          .send(text({ headerImage: header() }))
          .expect(201)
      ).body,
    );
    const preview = extraPreviewResponseSchema.parse(
      (await admin.get(`/api/admin/extras/${created.id}/preview`).expect(200)).body,
    );
    expect(preview.headerImage).toMatchObject({
      width: 1600,
      height: 800,
      alt: 'Una torre entre la niebla',
    });
    expect(preview.headerImage?.url).toContain('c_limit,w_1600');
  });
});
