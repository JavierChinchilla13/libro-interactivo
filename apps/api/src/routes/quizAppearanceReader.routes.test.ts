import {
  apiErrorSchema,
  attemptResponseSchema,
  quizIntroResponseSchema,
  type QuizAppearanceInput,
  type QuizContent,
} from '@libro/shared';
import { describe, expect, it } from 'vitest';
import { Quiz } from '../models/Quiz.js';
import { UserProgress } from '../models/UserProgress.js';
import { staffWorld } from '../test-utils/admin.js';
import { createUser } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';
import { playQuizToEnd } from '../test-utils/quizPlay.js';

useTestDb();

const bg = (name: string) => ({
  provider: 'cloudinary' as const,
  publicId: `libro/quiz-bg/${name}`,
  url: `https://res.cloudinary.com/demo/image/upload/libro/quiz-bg/${name}.jpg`,
  width: 1920,
  height: 1080,
  alt: `Fondo ${name}`,
});
const FULL: QuizAppearanceInput = {
  background: { kind: 'image', image: bg('secreto-visual') },
  overlay: { mode: 'auto', strength: 0.7 },
  accent: 'accent',
  cover: bg('portada-del-quiz'),
  introHtml: '<p>Una niebla espesa cubre el laboratorio.</p>',
};

/** Mundo con el desbloqueo por QR encendido (como en producción): la lectora solo ve lo que canjeó. */
async function world(unlocked: boolean, snapshot?: QuizContent) {
  const w = await staffWorld({ env: { REQUIRE_QR_UNLOCK: 'true' } });
  const book = await createBook();
  const content = snapshot ?? simpleContent({ title: 'Quiz de prueba' });
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content,
    publishedBy: w.adminUser._id,
  });
  const { User } = await import('../models/User.js');
  const reader = await User.findOne({ emailNormalized: 'usuario@ejemplo.com' }).lean();
  if (unlocked) {
    await UserProgress.create({
      userId: reader?._id,
      bookId: book._id,
      unlocked: [{ kind: 'quiz', refId: quiz._id, at: new Date() }],
    });
  }
  const save = async (appearance: QuizAppearanceInput, expectedRev = 0) =>
    w.editor
      .put(`/api/admin/quizzes/${quiz.id}/appearance`)
      .send({ appearance, expectedRev })
      .expect(200);
  return { ...w, book, quiz, content, save, intro: `/api/quizzes/${quiz.id}` };
}

describe('la introducción del quiz entrega la apariencia', () => {
  it('sin apariencia la introducción es la de siempre (del snapshot) y no trae `appearance`', async () => {
    const { reader, intro, content } = await world(true);
    const res = await reader.get(intro).expect(200);
    const body = quizIntroResponseSchema.parse(res.body);
    expect(body).not.toHaveProperty('appearance');
    expect(body.instructionsHtml).toBe(content.instructionsHtml);
  });

  it('con apariencia trae fondo, velo y acento, y toma de ella la introducción y la portada', async () => {
    const { reader, intro, save } = await world(true);
    await save(FULL);
    const res = await reader.get(intro).expect(200);
    const body = quizIntroResponseSchema.parse(res.body);
    expect(body.appearance?.background).toMatchObject({
      kind: 'image',
      image: { publicId: 'libro/quiz-bg/secreto-visual' },
    });
    expect(body.appearance?.overlay).toEqual({ mode: 'auto', strength: 0.7 });
    expect(body.appearance?.accent).toBe('accent');
    expect(body.instructionsHtml).toBe('<p>Una niebla espesa cubre el laboratorio.</p>');
    expect(body.image?.publicId).toBe('libro/quiz-bg/portada-del-quiz');
  });

  it('solo viajan fondo, velo y acento: ni historial, ni revisión, ni quién editó, ni copias de la introducción', async () => {
    const { reader, intro, save, editorUser } = await world(true);
    await save(FULL);
    const res = await reader.get(intro).expect(200);
    expect(Object.keys(res.body.appearance).sort()).toEqual(['accent', 'background', 'overlay']);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/appearanceRev|appearanceHistory|history|expectedRev|"rev"|before/);
    expect(text).not.toContain(String(editorUser._id));
  });

  it('una apariencia solo con fondo conserva la introducción y la portada del snapshot', async () => {
    const content: QuizContent = {
      ...simpleContent({ title: 'Quiz con portada' }),
      image: { ...bg('portada-snapshot'), deliveryType: 'upload' as const },
    };
    const { reader, intro, save } = await world(true, content);
    await save({ background: FULL.background });
    const body = quizIntroResponseSchema.parse((await reader.get(intro).expect(200)).body);
    expect(body.appearance?.background).toBeDefined();
    expect(body.instructionsHtml).toBe(content.instructionsHtml);
    expect(body.image?.publicId).toBe('libro/quiz-bg/portada-snapshot');
  });

  it('introHtml vacío es «quitar a propósito»: la introducción sale vacía aunque el snapshot tenga una', async () => {
    const { reader, intro, save, content } = await world(true);
    expect(content.instructionsHtml).not.toBe('');
    await save({ ...FULL, introHtml: '' });
    const body = quizIntroResponseSchema.parse((await reader.get(intro).expect(200)).body);
    expect(body.instructionsHtml).toBe('');
  });

  it('es de esa lectora y no se guarda en cachés compartidas', async () => {
    const { reader, intro, save } = await world(true);
    await save(FULL);
    const res = await reader.get(intro).expect(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('las editoras y administradoras (que siempre pasan) la ven igual', async () => {
    const { admin, editor, intro, save } = await world(false);
    await save(FULL);
    for (const agent of [admin, editor]) {
      const body = quizIntroResponseSchema.parse((await agent.get(intro).expect(200)).body);
      expect(body.appearance?.accent).toBe('accent');
    }
  });
});

describe('un quiz bloqueado no entrega nada de su apariencia (regla 2)', () => {
  it('sin canjear el QR responde 403 NOT_UNLOCKED y el cuerpo no contiene la apariencia', async () => {
    const { reader, intro, save, app } = await world(false);
    await save(FULL);
    const res = await reader.get(intro);
    expect(res.status).toBe(403);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('NOT_UNLOCKED');
    expect(Object.keys(res.body)).toEqual(['error']);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/appearance|secreto-visual|portada-del-quiz|cloudinary|niebla/i);
    const { default: request } = await import('supertest');
    expect((await request(app).get(intro)).status).toBe(401);
  });

  it('tampoco por los otros caminos del lector: iniciar el intento y las etapas siguen cerrados', async () => {
    const { reader, quiz, save } = await world(false);
    await save(FULL);
    const start = await reader.post(`/api/quizzes/${quiz.id}/attempts`);
    expect(start.status).toBe(403);
    expect(JSON.stringify(start.body)).not.toMatch(/appearance|secreto-visual/i);
  });

  it('un quiz que aún no se publicó (o archivado) sigue sin existir para la lectora', async () => {
    const { reader, quiz, save, editor } = await world(true);
    await save(FULL);
    await editor.post(`/api/admin/quizzes/${quiz.id}/archive`).expect(200);
    expect((await reader.get(`/api/quizzes/${quiz.id}`)).status).toBe(404);
  });
});

describe('sin fugas: la apariencia no sale por ningún otro payload y nada revela el resultado', () => {
  it('ni el progreso, ni la biblioteca, ni los libros, ni los intentos ni los resultados la contienen', async () => {
    const { reader, quiz, book, save, app } = await world(true);
    await save(FULL);
    const { default: request } = await import('supertest');
    const payloads: [string, unknown][] = [
      [
        '/api/me/progress',
        (await reader.get('/api/me/progress').query({ bookId: book.id }).expect(200)).body,
      ],
      ['/api/me/library', (await reader.get('/api/me/library').expect(200)).body],
      ['/api/books', (await request(app).get('/api/books').expect(200)).body],
      [
        `/api/books/${book.slug}`,
        (await request(app).get(`/api/books/${book.slug}`).expect(200)).body,
      ],
    ];
    const started = await reader.post(`/api/quizzes/${quiz.id}/attempts`).expect(200);
    payloads.push(['inicio del intento', started.body]);
    const done = await playQuizToEnd(reader, quiz.id);
    payloads.push(['resultado', done]);
    payloads.push([
      '/api/me/results',
      (await reader.get('/api/me/results').query({ bookId: book.id }).expect(200)).body,
    ]);
    payloads.push([
      '/api/me/results/:quizId',
      (await reader.get(`/api/me/results/${quiz.id}`).expect(200)).body,
    ]);
    for (const [name, body] of payloads) {
      const text = JSON.stringify(body);
      expect(text, name).not.toMatch(
        /appearance|secreto-visual|portada-del-quiz|libro\/quiz-bg|Una niebla espesa/,
      );
    }
  });

  it('la introducción no trae `resultKey`, `fieldSlug` ni nada que nombre un resultado', async () => {
    const { reader, intro, save, quiz } = await world(true);
    await save(FULL);
    const text = JSON.stringify((await reader.get(intro).expect(200)).body);
    expect(text).not.toMatch(/resultKey|fieldSlug|stages|questions|answers/);
    const stored = await Quiz.findById(quiz.id).lean();
    const results = (stored?.draft?.results ?? []) as { key: string; title: string }[];
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(text).not.toContain(result.title);
      expect(text).not.toContain(`"${result.key}"`);
    }
  });

  it('un intento empezado antes del cambio conserva sus preguntas y su resultado; la apariencia solo cambia la introducción', async () => {
    const { reader, quiz, save, intro } = await world(true);
    const started = attemptResponseSchema.parse(
      (await reader.post(`/api/quizzes/${quiz.id}/attempts`).expect(200)).body,
    );
    await save(FULL);
    // Reanudar el mismo intento devuelve la misma etapa y las mismas preguntas.
    const resumed = attemptResponseSchema.parse(
      (await reader.post(`/api/quizzes/${quiz.id}/attempts`).expect(200)).body,
    );
    expect(resumed).toEqual(started);
    expect(JSON.stringify(resumed)).not.toMatch(/appearance|secreto-visual/);
    // Y la introducción sí muestra la apariencia nueva.
    const body = quizIntroResponseSchema.parse((await reader.get(intro).expect(200)).body);
    expect(body.appearance?.accent).toBe('accent');
    expect(body.inProgressAttemptId).toBe(started.attemptId);
    // Completarlo da un resultado, sin apariencia.
    if (started.status !== 'in_progress') throw new Error('Se esperaba una etapa');
    const finished = attemptResponseSchema.parse(
      (
        await reader
          .post(`/api/attempts/${started.attemptId}/stages/${started.stage.stageId}/answers`)
          .send({
            answers: started.stage.questions.map((q) => ({
              questionId: q.id,
              answerId: q.answers[0]?.id,
            })),
          })
          .expect(200)
      ).body,
    );
    expect(finished.status).toBe('completed');
    expect(JSON.stringify(finished)).not.toMatch(/appearance|secreto-visual/);
  });

  it('otra lectora sin el QR sigue sin ver nada aunque otra sí lo canjeó', async () => {
    const { intro, save, app } = await world(true);
    await save(FULL);
    await createUser({ email: 'otra@ejemplo.com' });
    const { loginAgent } = await import('../test-utils/auth.js');
    const other = await loginAgent(app, 'otra@ejemplo.com');
    const res = await other.get(intro);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/appearance|secreto-visual/i);
  });
});
