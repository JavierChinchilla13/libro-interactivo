import { apiErrorSchema, imageSignatureResponseSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Book } from '../models/Book.js';
import { image, staffWorld, validBook } from '../test-utils/admin.js';
import { fakeImages, videoAsset } from '../test-utils/fakeImages.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';
import { configureCloudinaryAccount } from '../lib/images.js';
import { afterEach } from 'vitest';

useTestDb();
afterEach(() => configureCloudinaryAccount({ production: false }));

const code = (res: request.Response) => apiErrorSchema.parse(res.body).error.code;
const CLOUD = {
  CLOUDINARY_CLOUD_NAME: 'mi-cuenta',
  CLOUDINARY_API_KEY: '123456',
  CLOUDINARY_API_SECRET: 'secreto-de-prueba',
};
const video = (name = 'vid') => ({
  provider: 'cloudinary' as const,
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/mi-cuenta/video/upload/v1/libro/quiz-bg/${name}.mp4`,
  width: 1280,
  height: 720,
  durationSeconds: 5,
  posterUrl: `https://res.cloudinary.com/mi-cuenta/video/upload/so_0,f_auto,q_auto/v1/libro/quiz-bg/${name}.jpg`,
  alt: 'Niebla sobre una ciudad',
});

async function world(options: Parameters<typeof staffWorld>[0]) {
  const w = await staffWorld(options);
  const book = await createBook();
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: 'Quiz de prueba' }),
    publishedBy: w.adminUser._id,
  });
  return { ...w, quiz, url: `/api/admin/quizzes/${quiz.id}/appearance` };
}

describe('video de fondo por la ruta', () => {
  it('se guarda cuando Cloudinary confirma que cumple los límites', async () => {
    const cloud = fakeImages([videoAsset('libro/quiz-bg/vid')]);
    const { editor, url } = await world({ env: CLOUD, images: cloud.provider });
    const res = await editor
      .put(url)
      .send({ appearance: { background: { kind: 'video', video: video() } }, expectedRev: 0 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.appearance.background.video.durationSeconds).toBe(8.2);
  });

  it('se rechaza (400) si el archivo real dura de más, aunque el cuerpo diga lo contrario', async () => {
    const cloud = fakeImages([videoAsset('libro/quiz-bg/vid', { durationSeconds: 25 })]);
    const { editor, url } = await world({ env: CLOUD, images: cloud.provider });
    const res = await editor
      .put(url)
      .send({ appearance: { background: { kind: 'video', video: video() } }, expectedRev: 0 });
    expect(res.status).toBe(400);
    expect(code(res)).toBe('VALIDATION');
    expect(res.body.error.message).toContain('25,0 s');
  });

  it('sin Cloudinary configurado, un video responde 503 y una imagen se guarda sin problema', async () => {
    const { editor, url } = await world({});
    const res = await editor.put(url).send({
      appearance: {
        background: {
          kind: 'video',
          video: {
            ...video(),
            url: video().url.replace('mi-cuenta', 'demo'),
            posterUrl: video().posterUrl.replace('mi-cuenta', 'demo'),
          },
        },
      },
      expectedRev: 0,
    });
    expect(res.status).toBe(503);
    expect(code(res)).toBe('UNAVAILABLE');
    const ok = await editor.put(url).send({
      appearance: {
        background: {
          kind: 'image',
          image: {
            ...image('fondo'),
            publicId: 'libro/quiz-bg/fondo',
            url: 'https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/fondo.jpg',
            alt: 'Fondo',
          },
        },
      },
      expectedRev: 0,
    });
    expect(ok.status).toBe(200);
  });
});

describe('las URLs de contenido solo valen si son de nuestra cuenta', () => {
  it('un libro con portada de otra cuenta de Cloudinary se rechaza; de la nuestra (o de demo, fuera de producción) se acepta', async () => {
    const { editor } = await world({ env: CLOUD });
    let order = 1;
    const withCover = (cloud: string) =>
      validBook({
        slug: `libro-${cloud}`,
        order: (order += 1),
        status: 'published',
        cover: {
          ...image('portada'),
          url: `https://res.cloudinary.com/${cloud}/image/upload/libro/cover/p.jpg`,
        },
      });
    const foreign = await editor.post('/api/admin/books').send(withCover('otra-cuenta'));
    expect(foreign.status).toBe(400);
    expect(code(foreign)).toBe('VALIDATION');
    expect(await Book.countDocuments()).toBe(1); // solo el de la prueba
    await editor.post('/api/admin/books').send(withCover('mi-cuenta')).expect(201);
    await editor.post('/api/admin/books').send(withCover('demo')).expect(201);
  });
});

describe('firma de subida para fondos de quiz', () => {
  const signature = '/api/admin/uploads/image-signature';
  it('quiz-bg admite imagen y video, con su carpeta; las lectoras no pueden pedirla', async () => {
    const { editor, reader, app } = await world({ env: CLOUD });
    const image = imageSignatureResponseSchema.parse(
      (await editor.post(signature).send({ purpose: 'quiz-bg' }).expect(200)).body,
    );
    expect(image.params['folder']).toBe('libro/quiz-bg');
    const clip = imageSignatureResponseSchema.parse(
      (await editor.post(signature).send({ purpose: 'quiz-bg', resource: 'video' }).expect(200))
        .body,
    );
    expect(clip.uploadUrl).toBe('https://api.cloudinary.com/v1_1/mi-cuenta/video/upload');
    expect(clip.params['allowed_formats']).toBe('mp4,webm');
    expect(clip.maxBytes).toBe(5 * 1024 * 1024);
    expect((await reader.post(signature).send({ purpose: 'quiz-bg' })).status).toBe(403);
    await request(app).post(signature).send({ purpose: 'quiz-bg' }).expect(401);
  });
});
