import { libro1Story } from '@libro/game-core';
import { progressResponseSchema, publicBookDetailSchema } from '@libro/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { UserProgress } from '../models/UserProgress.js';
import { seedGameStory } from '../seed/gameStory.js';
import { createTestHarness } from '../test-utils/app.js';
import { createUser, loginAgent } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

const QUIZ_TITLE = 'TITULO-DEL-QUIZ-1';
const QUIZ_2_TITLE = 'TITULO-DEL-QUIZ-2';

async function world() {
  const harness = createTestHarness({ env: { REQUIRE_QR_UNLOCK: 'true' } });
  const admin = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
  const user = await createUser();
  const book = await createBook();
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: QUIZ_TITLE }),
    publishedBy: admin._id,
  });
  await createQuiz({
    bookId: book._id,
    order: 2,
    slug: 'quiz-2',
    content: simpleContent({ title: QUIZ_2_TITLE }),
    publishedBy: admin._id,
  });
  const story = await seedGameStory({ bookId: book.id, story: libro1Story });
  return { ...harness, user, book, quiz, story };
}

/** Nada de lo que identifica un quiz o el juego sale en la ficha pública: ni títulos ni identificadores. */
function expectNoTitles(body: unknown, ids: string[]) {
  const text = JSON.stringify(body);
  expect(text).not.toContain(QUIZ_TITLE);
  expect(text).not.toContain(QUIZ_2_TITLE);
  expect(text).not.toContain(libro1Story.title);
  for (const id of ids) expect(text).not.toContain(id);
}

describe('ficha pública del libro: sin títulos de los quizzes', () => {
  it('un visitante anónimo no recibe títulos, solo el tipo y la posición de cada experiencia', async () => {
    const { app, quiz, story } = await world();
    const res = await request(app).get('/api/books/libro-1').expect(200);
    const detail = publicBookDetailSchema.parse(res.body);
    expect(detail.experiences).toEqual([
      { kind: 'quiz', order: 1 },
      { kind: 'quiz', order: 2 },
      { kind: 'game', order: 3 },
    ]);
    expectNoTitles(res.body, [quiz.id, story.id]);
  });

  it('una lectora sin QR recibe exactamente lo mismo que el visitante', async () => {
    const { app, quiz, story } = await world();
    const anonymous = await request(app).get('/api/books/libro-1').expect(200);
    const agent = await loginAgent(app);
    const res = await agent.get('/api/books/libro-1').expect(200);
    expect(res.body).toEqual(anonymous.body);
    expectNoTitles(res.body, [quiz.id, story.id]);
  });

  it('una lectora con el QR del libro tampoco los recibe de la ficha pública; sus títulos salen de su avance', async () => {
    const { app, user, book, quiz, story } = await world();
    await UserProgress.create({
      userId: user._id,
      bookId: book._id,
      unlocked: [{ kind: 'quiz', refId: quiz._id, at: new Date() }],
    });
    const agent = await loginAgent(app);
    const res = await agent.get('/api/books/libro-1').expect(200);
    expectNoTitles(res.body, [quiz.id, story.id]);

    const progress = progressResponseSchema.parse(
      (await agent.get('/api/me/progress').query({ bookId: book.id }).expect(200)).body,
    );
    expect(progress.experiences.map((e) => e.title)).toContain(QUIZ_TITLE);
  });

  it('la respuesta se puede guardar en caché compartida porque no depende de la sesión', async () => {
    const { app } = await world();
    const res = await request(app).get('/api/books/libro-1').expect(200);
    expect(res.headers['cache-control']).toMatch(/public/);
  });
});
