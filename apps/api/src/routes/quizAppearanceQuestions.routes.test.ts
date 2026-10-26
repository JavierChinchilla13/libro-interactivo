import { apiErrorSchema, attemptResponseSchema, type StagePayload } from '@libro/shared';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { configureCloudinaryAccount } from '../lib/images.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { UserProgress } from '../models/UserProgress.js';
import { image as bookImage, staffWorld } from '../test-utils/admin.js';
import { fakeImages, videoAsset } from '../test-utils/fakeImages.js';
import { useTestDb } from '../test-utils/db.js';
import {
  createBook,
  createQuiz,
  simpleContent,
  twoStageContent,
} from '../test-utils/quizFixtures.js';

void bookImage;
useTestDb();
afterEach(() => configureCloudinaryAccount({ production: false }));

const code = (res: request.Response) => apiErrorSchema.parse(res.body).error.code;
const CLOUD = {
  CLOUDINARY_CLOUD_NAME: 'mi-cuenta',
  CLOUDINARY_API_KEY: '123456',
  CLOUDINARY_API_SECRET: 'secreto-de-prueba',
};
const photo = (name: string) => ({
  provider: 'cloudinary' as const,
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/mi-cuenta/image/upload/libro/quiz-bg/${name}.jpg`,
  width: 1920,
  height: 1080,
  alt: `Foto secreta ${name}`,
});
const clip = (name: string) => ({
  provider: 'cloudinary' as const,
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/mi-cuenta/video/upload/v1/libro/quiz-bg/${name}.mp4`,
  width: 1280,
  height: 720,
  durationSeconds: 5,
  posterUrl: `https://res.cloudinary.com/mi-cuenta/video/upload/so_0,f_auto,q_auto/v1/libro/quiz-bg/${name}.jpg`,
  alt: `Clip ${name}`,
});

/** Mundo con QR obligatorio (como producción), un quiz publicado y la lectora lista para desbloquearlo. */
async function world(content = simpleContent({ title: 'Quiz de prueba' }), cloud = fakeImages()) {
  const w = await staffWorld({
    env: { ...CLOUD, REQUIRE_QR_UNLOCK: 'true' },
    images: cloud.provider,
  });
  const book = await createBook();
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content,
    publishedBy: w.adminUser._id,
  });
  const { User } = await import('../models/User.js');
  const readerUser = await User.findOne({ emailNormalized: 'usuario@ejemplo.com' }).lean();
  const unlock = () =>
    UserProgress.create({
      userId: readerUser?._id,
      bookId: book._id,
      unlocked: [{ kind: 'quiz', refId: quiz._id, at: new Date() }],
    });
  const url = `/api/admin/quizzes/${quiz.id}/appearance`;
  const save = (questions: Record<string, unknown>, expectedRev = 0, extra: object = {}) =>
    w.editor.put(url).send({ appearance: { questions, ...extra }, expectedRev });
  return { ...w, book, quiz, id: quiz.id as string, url, unlock, save, cloud };
}

const stageOf = (res: request.Response): StagePayload => {
  const parsed = attemptResponseSchema.parse(res.body);
  if (parsed.status !== 'in_progress') throw new Error('Se esperaba una etapa');
  return parsed.stage;
};
const customized = (stage: StagePayload) =>
  stage.questions.filter((q) => q.appearance).map((q) => q.id);

describe('permisos y validación de los ajustes por pregunta', () => {
  it('sin sesión 401, lectora 403, editora y administradora 200', async () => {
    const { app, reader, editor, admin, url } = await world();
    const body = {
      appearance: { questions: { 'etapa-1-p1': { accent: '#ff8fb1' } } },
      expectedRev: 0,
    };
    expect((await request(app).put(url).send(body)).status).toBe(401);
    expect((await reader.put(url).send(body)).status).toBe(403);
    expect((await editor.put(url).send(body)).status).toBe(200);
    expect((await admin.put(url).send({ ...body, expectedRev: 1 })).status).toBe(200);
  });

  it('rechaza (400) lo que no es decoración o no cumple los topes, y no guarda nada', async () => {
    const { save, url, editor } = await world();
    const cases: Record<string, unknown>[] = [
      { 'etapa-1-p1': { resultKey: 'r1' } },
      { 'etapa-1-p1': { introHtml: '<p>x</p>' } },
      { '../etapa': { accent: '#ff8fb1' } },
      { 'etapa-1-p1': { accent: 'rojo' } },
      { 'etapa-1-p1': { overlay: { mode: 'manual', strength: 0.5 } } },
      {
        'etapa-1-p1': {
          background: { kind: 'image', image: { ...photo('a'), publicId: 'libro/otra/a' } },
        },
      },
    ];
    for (const questions of cases) {
      const res = await save(questions);
      expect(res.status, JSON.stringify(questions)).toBe(400);
      expect(code(res)).toBe('VALIDATION');
    }
    expect((await editor.get(url).expect(200)).body).toMatchObject({ appearance: null, rev: 0 });
  });

  it('topes: 5 preguntas con fondo propio como máximo (con 6, 400) y 60 preguntas con ajustes', async () => {
    const { save } = await world();
    const media = (n: number) =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [
          `q${i}`,
          { background: { kind: 'image', image: photo(`m${i}`) } },
        ]),
      );
    const six = await save(media(6));
    expect(six.status).toBe(400);
    expect(six.body.error.message).toContain('5 preguntas');
    expect((await save(media(5))).status).toBe(200);
    const many = Object.fromEntries(
      Array.from({ length: 61 }, (_, i) => [`q${i}`, { accent: '#123456' }]),
    );
    expect((await save(many, 1)).status).toBe(400);
  });

  it('topes: como máximo 4 videos en el quiz, contando el general', async () => {
    const assets = ['g', 'a', 'b', 'c', 'd'].map((name) => videoAsset(`libro/quiz-bg/${name}`));
    const { save } = await world(simpleContent(), fakeImages(assets));
    const clips = (names: string[]) =>
      Object.fromEntries(
        names.map((name) => [`q-${name}`, { background: { kind: 'video', video: clip(name) } }]),
      );
    const general = { background: { kind: 'video', video: clip('g') } };
    expect((await save(clips(['a', 'b', 'c']), 0, general)).status).toBe(200);
    const five = await save(clips(['a', 'b', 'c', 'd']), 1, general);
    expect(five.status).toBe(400);
    expect(five.body.error.message).toContain('4 videos');
  });

  it('un video de una pregunta se verifica con Cloudinary y el error dice de qué pregunta es', async () => {
    const cloud = fakeImages([videoAsset('libro/quiz-bg/largo', { durationSeconds: 25 })]);
    const { save } = await world(simpleContent(), cloud);
    const res = await save({
      'etapa-1-p2': { background: { kind: 'video', video: clip('largo') } },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(
      'En la pregunta «etapa-1-p2»: El video dura 25,0 s; el máximo es 10 s',
    );
  });

  it('solo se consultan a Cloudinary los videos que cambiaron (cuida la cuota)', async () => {
    const cloud = fakeImages(['a', 'b'].map((n) => videoAsset(`libro/quiz-bg/${n}`)));
    const { save } = await world(simpleContent(), cloud);
    const clips = (names: string[]) =>
      Object.fromEntries(
        names.map((n) => [`q-${n}`, { background: { kind: 'video', video: clip(n) } }]),
      );
    await save(clips(['a']));
    expect(cloud.provider.inspect).toHaveBeenCalledTimes(1);
    // Se añade otro video; el primero se guardó con lo medido por Cloudinary y no se vuelve a consultar.
    const stored = (await Quiz.findOne().lean())?.appearance as {
      questions: Record<string, unknown>;
    };
    const res = await save({ ...stored.questions, ...clips(['b']) }, 1);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(cloud.provider.inspect).toHaveBeenCalledTimes(2);
  });

  it('una pregunta sin ningún ajuste no ocupa lugar', async () => {
    const { save, editor, url } = await world();
    expect((await save({ 'etapa-1-p1': {} })).status).toBe(200);
    expect((await editor.get(url)).body.appearance.questions).toBeUndefined();
  });
});

describe('auditoría y reversión', () => {
  it('guardar ajustes por pregunta queda en el historial como «preguntas», no crea versión y se puede revertir', async () => {
    const { save, editor, url, quiz } = await world();
    const versions = await QuizVersion.countDocuments({ quizId: quiz._id });
    const first = await save({ 'etapa-1-p1': { accent: '#ff8fb1' } });
    expect(first.body.history[0]).toMatchObject({
      rev: 1,
      action: 'seed',
      changed: expect.arrayContaining(['questions']),
    });
    const second = await save(
      { 'etapa-1-p1': { accent: '#5fe3ae' }, 'etapa-1-p2': { accent: '#ffcb66' } },
      1,
    );
    expect(second.body.history[0]).toMatchObject({
      rev: 2,
      action: 'update',
      changed: ['questions'],
    });
    expect(await QuizVersion.countDocuments({ quizId: quiz._id })).toBe(versions);

    const back = await editor.post(`${url}/revert`).send({ rev: 2, expectedRev: 2 }).expect(200);
    expect(back.body.appearance.questions).toEqual({ 'etapa-1-p1': { accent: '#ff8fb1' } });
    expect(back.body.history[0]).toMatchObject({ action: 'revert', changed: ['questions'] });
  });

  it('el historial sigue en 10 estados aunque los ajustes sean grandes', async () => {
    const { save } = await world();
    let res = await save({ 'etapa-1-p1': { accent: '#000001' } });
    for (let i = 2; i <= 12; i += 1) {
      res = await save({ 'etapa-1-p1': { accent: `#00000${(i % 9) + 1}` } }, i - 1);
    }
    expect(res.body.history).toHaveLength(10);
  });
});

describe('entrega con la etapa (sesión y desbloqueo en cada petición)', () => {
  it('la lectora desbloqueada recibe los ajustes de SUS preguntas junto a la etapa, con cabecera private no-store', async () => {
    const w = await world();
    await w.unlock();
    await w
      .save({
        'etapa-1-p2': { background: { kind: 'image', image: photo('p2') }, accent: '#ff8fb1' },
        'ya-no-existe': { accent: '#ffcb66' },
      })
      .expect(200);
    const res = await w.reader.post(`/api/quizzes/${w.id}/attempts`).expect(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const stage = stageOf(res);
    expect(customized(stage)).toEqual(['etapa-1-p2']);
    expect(stage.questions.find((q) => q.id === 'etapa-1-p2')?.appearance).toMatchObject({
      accent: '#ff8fb1',
      background: { kind: 'image' },
    });
    // Reanudar entrega lo mismo; los ids de preguntas que ya no existen se ignoran sin error.
    expect(stageOf(await w.reader.post(`/api/quizzes/${w.id}/attempts`).expect(200))).toEqual(
      stage,
    );
    expect(JSON.stringify(res.body)).not.toContain('ya-no-existe');
  });

  it('la etapa siguiente también trae los ajustes de sus preguntas, y la cabecera va en el envío', async () => {
    const w = await world(twoStageContent());
    await w.unlock();
    await w
      .save({ 'etapa-fuego-p1': { accent: '#ff8fb1' }, 'etapa-agua-p1': { accent: '#5fe3ae' } })
      .expect(200);
    const first = stageOf(await w.reader.post(`/api/quizzes/${w.id}/attempts`).expect(200));
    expect(customized(first)).toEqual([]);
    const attempt = await QuizAttempt.findOne({ quizId: w.quiz._id }).lean();
    const sent = await w.reader
      .post(`/api/attempts/${attempt?._id.toString()}/stages/${first.stageId}/answers`)
      .send({
        answers: first.questions.map((q) => ({ questionId: q.id, answerId: q.answers[0]!.id })),
      })
      .expect(200);
    expect(sent.headers['cache-control']).toBe('private, no-store');
    const next = stageOf(sent);
    expect(next.stageId).toBe('etapa-fuego'); // la primera respuesta suma a «fuego»
    expect(customized(next)).toEqual(['etapa-fuego-p1']);
  });

  it('sin QR no se entrega nada: 403 sin rastro de la apariencia', async () => {
    const w = await world();
    await w
      .save({ 'etapa-1-p1': { background: { kind: 'image', image: photo('secreto') } } })
      .expect(200);
    const res = await w.reader.post(`/api/quizzes/${w.id}/attempts`);
    expect(res.status).toBe(403);
    expect(code(res)).toBe('NOT_UNLOCKED');
    expect(JSON.stringify(res.body)).not.toMatch(/secreto|appearance|libro\/quiz-bg|questions/i);
    expect((await request(w.app).post(`/api/quizzes/${w.id}/attempts`)).status).toBe(401);
  });

  it('sin fugas: ni resultKey, ni introducción, ni historial, ni autor; y la URL de una pregunta no sale por ningún otro payload', async () => {
    const w = await world();
    await w.unlock();
    await w
      .save(
        {
          'etapa-1-p1': {
            background: { kind: 'image', image: photo('de-pregunta') },
            accent: '#ff8fb1',
          },
        },
        0,
        { introHtml: '<p>Una niebla espesa.</p>' },
      )
      .expect(200);
    const res = await w.reader.post(`/api/quizzes/${w.id}/attempts`).expect(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(
      /resultKey|fieldSlug|introHtml|niebla|appearanceRev|appearanceHistory|expectedRev|"rev"|"by"|before/,
    );
    // La introducción trae solo el general (nada de `questions`).
    const intro = await w.reader.get(`/api/quizzes/${w.id}`).expect(200);
    expect(JSON.stringify(intro.body)).not.toMatch(/de-pregunta|questions/);
    // Y ningún otro endpoint de la lectora (ni público) la contiene.
    const others = [
      (await w.reader.get('/api/me/progress').query({ bookId: w.book.id }).expect(200)).body,
      (await w.reader.get('/api/me/library').expect(200)).body,
      (await w.reader.get('/api/me/results').query({ bookId: w.book.id }).expect(200)).body,
      (await request(w.app).get('/api/books').expect(200)).body,
    ];
    expect(JSON.stringify(others)).not.toMatch(/de-pregunta|libro\/quiz-bg/);
  });

  it('la apariencia por pregunta no cambia el contenido: ni la versión ni el intento guardan nada de ella', async () => {
    const w = await world();
    await w.unlock();
    const before = await QuizVersion.findOne({ quizId: w.quiz._id }).lean();
    await w.save({ 'etapa-1-p1': { accent: '#ff8fb1' } }).expect(200);
    await w.reader.post(`/api/quizzes/${w.id}/attempts`).expect(200);
    const after = await QuizVersion.findOne({ quizId: w.quiz._id }).lean();
    expect(after?.contentHash).toBe(before?.contentHash);
    const attempt = await QuizAttempt.findOne({ quizId: w.quiz._id }).lean();
    expect(JSON.stringify(attempt)).not.toMatch(/ff8fb1|appearance/);
  });
});
