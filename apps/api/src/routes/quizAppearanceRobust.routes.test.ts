import { apiErrorSchema, quizAppearanceResponseSchema } from '@libro/shared';
import { pino } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureCloudinaryAccount } from '../lib/images.js';
import { LOG_REDACTION } from '../lib/logger.js';
import { Quiz } from '../models/Quiz.js';
import { User } from '../models/User.js';
import { staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';
import { fakeImages, videoAsset } from '../test-utils/fakeImages.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();
afterEach(() => {
  configureCloudinaryAccount({ production: false });
  vi.restoreAllMocks();
});

const CLOUD = {
  CLOUDINARY_CLOUD_NAME: 'mi-cuenta',
  CLOUDINARY_API_KEY: '123456',
  CLOUDINARY_API_SECRET: 'secreto-de-prueba',
};
const imageBackground = {
  kind: 'image' as const,
  image: {
    provider: 'cloudinary' as const,
    publicId: 'libro/quiz-bg/uno',
    url: 'https://res.cloudinary.com/mi-cuenta/image/upload/v1/libro/quiz-bg/uno.jpg',
    width: 1920,
    height: 1080,
    alt: 'Fondo uno',
  },
};
const videoBackground = {
  kind: 'video' as const,
  video: {
    provider: 'cloudinary' as const,
    publicId: 'libro/quiz-bg/vid',
    url: 'https://res.cloudinary.com/mi-cuenta/video/upload/v1/libro/quiz-bg/vid.mp4',
    width: 1280,
    height: 720,
    durationSeconds: 5,
    posterUrl:
      'https://res.cloudinary.com/mi-cuenta/video/upload/so_0,f_auto,q_auto/v1/libro/quiz-bg/vid.jpg',
    alt: 'Niebla sobre una ciudad',
  },
};

async function world(options: Parameters<typeof staffWorld>[0] = {}) {
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

describe('revertir pasa por la verificación de medios', () => {
  it('un video que Cloudinary ya no tiene no se restaura («súbelo de nuevo») y no cambia nada', async () => {
    const cloud = fakeImages([videoAsset('libro/quiz-bg/vid')]);
    const { editor, url } = await world({ env: CLOUD, images: cloud.provider });
    await editor
      .put(url)
      .send({ appearance: { background: videoBackground }, expectedRev: 0 })
      .expect(200);
    await editor
      .put(url)
      .send({ appearance: { background: imageBackground }, expectedRev: 1 })
      .expect(200);

    // El video desaparece de Cloudinary después de haberse guardado.
    await cloud.provider.destroy({ publicId: 'libro/quiz-bg/vid', resource: 'video' });
    const res = await editor.post(`${url}/revert`).send({ rev: 2, expectedRev: 2 });

    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.message).toContain('súbelo de nuevo');
    const after = quizAppearanceResponseSchema.parse((await editor.get(url).expect(200)).body);
    expect(after.rev).toBe(2);
    expect(after.appearance?.background?.kind).toBe('image');
  });

  it('si el video sigue en Cloudinary, revertir lo restaura', async () => {
    const cloud = fakeImages([videoAsset('libro/quiz-bg/vid')]);
    const { editor, url } = await world({ env: CLOUD, images: cloud.provider });
    await editor
      .put(url)
      .send({ appearance: { background: videoBackground }, expectedRev: 0 })
      .expect(200);
    await editor
      .put(url)
      .send({ appearance: { background: imageBackground }, expectedRev: 1 })
      .expect(200);

    const res = await editor.post(`${url}/revert`).send({ rev: 2, expectedRev: 2 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(quizAppearanceResponseSchema.parse(res.body).appearance?.background?.kind).toBe('video');
  });
});

describe('una apariencia guardada que ya no se puede leer', () => {
  const unreadable = { background: { kind: 'hologram' }, algoNuevo: true };

  it('avisa y deja constancia sin datos; guardar encima conserva lo anterior en el historial', async () => {
    const lines: string[] = [];
    const logger = pino(
      { level: 'info', redact: LOG_REDACTION },
      { write: (line: string) => void lines.push(line) },
    );
    const { editor, quiz, url } = await world({ logger });
    await Quiz.updateOne({ _id: quiz._id }, { $set: { appearance: unreadable } });

    const read = quizAppearanceResponseSchema.parse((await editor.get(url).expect(200)).body);
    expect(read.appearance).toBeNull();
    expect(read.warnings).toContain('APPEARANCE_UNREADABLE');
    const log = lines.join(' ');
    expect(log).toContain('ya no cumple el esquema');
    expect(log).toContain(quiz.id);
    expect(log).not.toContain('hologram');

    // Al guardar se reemplaza, pero lo ilegible queda tal cual en el historial (no se pierde sin rastro).
    const saved = await editor
      .put(url)
      .send({ appearance: { introHtml: '<p>Hola</p>' }, expectedRev: 0 })
      .expect(200);
    expect(quizAppearanceResponseSchema.parse(saved.body).warnings).not.toContain(
      'APPEARANCE_UNREADABLE',
    );
    const stored = await Quiz.findById(quiz._id).lean();
    expect(stored?.appearanceHistory?.[0]?.before).toEqual(unreadable);
  });

  it('una apariencia legible no genera ese aviso', async () => {
    const { editor, url } = await world();
    const read = quizAppearanceResponseSchema.parse((await editor.get(url).expect(200)).body);
    expect(read.warnings).not.toContain('APPEARANCE_UNREADABLE');
  });
});

describe('si falla la lectura posterior al guardado', () => {
  it('responde 200 con lo guardado (no 500) y el cambio queda en la base', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => void lines.push(line) });
    const { editor, quiz, url } = await world({ logger });
    // Los nombres de quienes editaron se consultan después de guardar.
    vi.spyOn(User, 'find').mockImplementation((() => {
      throw new Error('falla simulada');
    }) as unknown as typeof User.find);

    const res = await editor
      .put(url)
      .send({ appearance: { introHtml: '<p>Hola</p>' }, expectedRev: 0 });
    vi.restoreAllMocks();

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const body = quizAppearanceResponseSchema.parse(res.body);
    expect(body.appearance?.introHtml).toBe('<p>Hola</p>');
    expect(body.rev).toBe(1);
    expect(body.history).toEqual([]);
    expect(lines.join(' ')).toContain('falló la lectura posterior');

    const stored = await Quiz.findById(quiz._id).lean();
    expect(stored?.appearanceRev).toBe(1);
    expect(stored?.appearanceHistory).toHaveLength(1);
    // Con todo funcionando de nuevo, la lectura trae el historial completo.
    const again = quizAppearanceResponseSchema.parse((await editor.get(url).expect(200)).body);
    expect(again.history).toHaveLength(1);
  });
});
