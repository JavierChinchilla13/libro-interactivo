import {
  adminStatsSchema,
  gameSessionResponseSchema,
  progressResponseSchema,
  quizResultsResponseSchema,
  resultsListResponseSchema,
  testProgressResetResponseSchema,
} from '@libro/shared';
import { libro1Story } from '@libro/game-core';
import { pino } from 'pino';
import supertest from 'supertest';
import { describe, expect, it } from 'vitest';
import { Book } from '../models/Book.js';
import { ExtraAccess } from '../models/ExtraAccess.js';
import { Extra } from '../models/Extra.js';
import { GameSession } from '../models/GameSession.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { User } from '../models/User.js';
import { UserProgress } from '../models/UserProgress.js';
import { seedGameStory } from '../seed/gameStory.js';
import { image, staffWorld } from '../test-utils/admin.js';
import { useTestDb } from '../test-utils/db.js';
import { playQuizToEnd } from '../test-utils/quizPlay.js';
import { createQuiz, simpleContent } from '../test-utils/quizFixtures.js';

useTestDb();

/** Un libro publicado con un quiz que se puede repetir y la historia del juego (sin QR obligatorio). */
async function world(options: Parameters<typeof staffWorld>[0] = {}) {
  const w = await staffWorld(options);
  const book = await Book.create({
    slug: 'libro-1',
    title: '[PLACEHOLDER] Libro 1',
    order: 1,
    status: 'published',
    cover: image('c'),
  });
  const bookId = book._id.toString();
  const quiz = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: 'Quiz 1' }),
    publishedBy: w.adminUser._id,
  });
  await seedGameStory({ bookId, story: libro1Story });
  return { ...w, bookId, quizId: quiz._id.toString(), visitor: supertest(w.app) };
}

const WIN = ['derecha', 'escaleras', 'ruta-a', 'esconderse', 'seguir'];
const playGame = async (
  agent: { post: (u: string) => supertest.Test },
  bookId: string,
  choices: string[],
) => {
  const started = gameSessionResponseSchema.parse(
    (await agent.post(`/api/game/${bookId}/sessions`).expect(200)).body,
  );
  let session = started;
  for (const choiceId of choices) {
    const res = await agent
      .post(`/api/game/sessions/${session.sessionId}/choices`)
      .send({ choiceId })
      .expect(200);
    session = gameSessionResponseSchema.parse(res.body);
  }
  return session;
};

describe('resultados simétricos: el equipo ve sus pruebas y el lector su avance real', () => {
  it('lista y detalle: cada quien ve solo lo suyo, sin cruzarse', async () => {
    const w = await world();
    await playQuizToEnd(w.reader, w.quizId);
    await playQuizToEnd(w.admin, w.quizId);
    await playQuizToEnd(w.admin, w.quizId);
    await playQuizToEnd(w.editor, w.quizId);

    const list = async (agent: typeof w.reader) =>
      resultsListResponseSchema.parse(
        (await agent.get(`/api/me/results?bookId=${w.bookId}`).expect(200)).body,
      ).results;
    expect((await list(w.reader)).map((r) => r.attemptsCompleted)).toEqual([1]);
    expect((await list(w.admin)).map((r) => r.attemptsCompleted)).toEqual([2]);
    expect((await list(w.editor)).map((r) => r.attemptsCompleted)).toEqual([1]);

    const detail = async (agent: typeof w.reader) =>
      quizResultsResponseSchema.parse(
        (await agent.get(`/api/me/results/${w.quizId}`).expect(200)).body,
      );
    const [reader, admin, editor] = [
      await detail(w.reader),
      await detail(w.admin),
      await detail(w.editor),
    ];
    expect(reader.history).toHaveLength(1);
    expect(admin.history).toHaveLength(2);
    expect(editor.history).toHaveLength(1);
    const ids = [reader, admin, editor].map((d) => d.current.attemptId);
    expect(new Set(ids).size).toBe(3);
    // El intento del lector es real y los otros son de prueba.
    const real = await QuizAttempt.findById(reader.current.attemptId).lean();
    expect(real?.isTest).toBe(false);
    for (const attemptId of [admin.current.attemptId, editor.current.attemptId]) {
      expect((await QuizAttempt.findById(attemptId).lean())?.isTest).toBe(true);
    }
  });

  it('sin pruebas el equipo ve «sin resultado», y el lector sin avance real tampoco ve las del equipo', async () => {
    const w = await world();
    await playQuizToEnd(w.admin, w.quizId);
    expect(
      resultsListResponseSchema.parse(
        (await w.reader.get(`/api/me/results?bookId=${w.bookId}`).expect(200)).body,
      ).results,
    ).toEqual([]);
    expect((await w.reader.get(`/api/me/results/${w.quizId}`)).status).toBe(404);
    expect((await w.editor.get(`/api/me/results/${w.quizId}`)).status).toBe(404);
    await w.admin.get(`/api/me/results/${w.quizId}`).expect(200);
    expect((await w.visitor.get(`/api/me/results/${w.quizId}`)).status).toBe(401);
  });
});

describe('nada de lo que prueba el equipo cuenta para lo real', () => {
  it('estadísticas, avance del lector y registros reales no cambian al jugar como equipo', async () => {
    const w = await world();
    await playQuizToEnd(w.reader, w.quizId);
    const stats = async () =>
      adminStatsSchema.parse((await w.admin.get('/api/admin/stats').expect(200)).body);
    const before = await stats();
    const readerProgress = async () =>
      progressResponseSchema.parse(
        (await w.reader.get(`/api/me/progress?bookId=${w.bookId}`).expect(200)).body,
      );
    const readerBefore = await readerProgress();

    for (let i = 0; i < 3; i += 1) await playQuizToEnd(w.admin, w.quizId);
    await playQuizToEnd(w.editor, w.quizId);
    await playGame(w.admin, w.bookId, WIN);
    await playGame(w.editor, w.bookId, WIN);

    expect(await stats()).toEqual(before);
    expect(await readerProgress()).toEqual(readerBefore);
    expect(await QuizAttempt.countDocuments({ isTest: false })).toBe(1);
    expect(await GameSession.countDocuments({ isTest: false })).toBe(0);
    expect(await UserProgress.countDocuments()).toBe(1); // solo el del lector
    const detail = await w.admin.get('/api/admin/users').expect(200);
    expect(JSON.stringify(detail.body)).not.toContain('"isTest"');
  });

  it('el equipo cuenta como «personal», no como lectores, y sus pruebas no suman a los quizzes del panel', async () => {
    const w = await world();
    await playQuizToEnd(w.admin, w.quizId);
    const stats = adminStatsSchema.parse((await w.admin.get('/api/admin/stats').expect(200)).body);
    expect(stats.attempts).toEqual({ completed: 0, inProgress: 0 });
    expect(stats.quizzes.find((q) => q.quizId === w.quizId)?.attempts ?? 0).toBe(0);
    expect(stats.readers.total).toBe(1);
  });
});

describe('vencimiento de las pruebas', () => {
  it('un intento de prueba terminado vence a los 30 días; uno real no vence', async () => {
    const w = await world();
    await playQuizToEnd(w.reader, w.quizId);
    await playQuizToEnd(w.admin, w.quizId);
    const test = await QuizAttempt.findOne({ isTest: true, status: 'completed' }).lean();
    const real = await QuizAttempt.findOne({ isTest: false, status: 'completed' }).lean();
    expect(real?.expireAt).toBeUndefined();
    const days = ((test?.expireAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it('una partida de prueba terminada vence a los 30 días', async () => {
    const w = await world();
    const done = await playGame(w.admin, w.bookId, WIN);
    expect(done.status).toBe('completed');
    const stored = await GameSession.findOne({ isTest: true }).lean();
    const days = ((stored?.expireAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });
});

describe('DELETE /api/me/test-progress', () => {
  const url = '/api/me/test-progress';

  it('borra solo los intentos y partidas de PRUEBA de la cuenta de la sesión y devuelve conteos', async () => {
    const w = await world();
    await playQuizToEnd(w.admin, w.quizId);
    await playQuizToEnd(w.admin, w.quizId);
    await playGame(w.admin, w.bookId, WIN);
    // Otra cuenta del equipo y un lector con su propio avance.
    await playQuizToEnd(w.editor, w.quizId);
    await playGame(w.editor, w.bookId, WIN);
    await playQuizToEnd(w.reader, w.quizId);

    const res = await w.admin.delete(url).expect(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(testProgressResetResponseSchema.parse(res.body)).toEqual({
      quizAttempts: 2,
      gameSessions: 1,
    });
    const adminId = w.adminUser._id;
    expect(await QuizAttempt.countDocuments({ userId: adminId })).toBe(0);
    expect(await GameSession.countDocuments({ userId: adminId })).toBe(0);
    // Nada de otras personas.
    expect(await QuizAttempt.countDocuments({ userId: w.editorUser._id, isTest: true })).toBe(1);
    expect(await GameSession.countDocuments({ userId: w.editorUser._id, isTest: true })).toBe(1);
    expect(await QuizAttempt.countDocuments({ isTest: false })).toBe(1);
    // El recorrido vuelve a empezar desde cero.
    const progress = progressResponseSchema.parse(
      (await w.admin.get(`/api/me/progress?bookId=${w.bookId}`).expect(200)).body,
    );
    expect(progress.experiences.every((e) => e.status === 'available')).toBe(true);
    expect(
      resultsListResponseSchema.parse(
        (await w.admin.get(`/api/me/results?bookId=${w.bookId}`).expect(200)).body,
      ).results,
    ).toEqual([]);
    // Repetirlo no falla y no borra nada más.
    expect(
      testProgressResetResponseSchema.parse((await w.admin.delete(url).expect(200)).body),
    ).toEqual({ quizAttempts: 0, gameSessions: 0 });
  });

  it('no toca lo que no es de prueba: avance heredado, vistas de extras, intentos reales de la cuenta ni su ficha', async () => {
    const w = await world();
    const adminId = w.adminUser._id;
    // Lo que una cuenta del equipo puede tener heredado de cuando jugaba como lectora.
    await UserProgress.create({
      userId: adminId,
      bookId: w.bookId,
      unlocked: [{ kind: 'quiz', refId: w.quizId, at: new Date() }],
      completed: [
        {
          kind: 'quiz',
          refId: w.quizId,
          firstCompletedAt: new Date(),
          currentAttemptId: w.bookId,
          currentResultKey: 'r1',
        },
      ],
      bookCompletedAt: new Date(),
    });
    const extra = await Extra.create({
      bookId: w.bookId,
      slug: 'extra',
      title: '[PLACEHOLDER] Extra',
      kind: 'text',
      bodyHtml: '<p>x</p>',
      order: 1,
      status: 'published',
    });
    await ExtraAccess.create({
      userId: adminId,
      extraId: extra._id,
      bookId: w.bookId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      viewCount: 3,
    });
    // Un intento REAL heredado de la misma cuenta (jugó como lectora antes de ser del equipo).
    const version = await QuizVersion.findOne({ quizId: w.quizId }).orFail();
    await QuizAttempt.create({
      userId: adminId,
      bookId: w.bookId,
      quizId: w.quizId,
      quizVersionId: version._id,
      version: 1,
      attemptNumber: 1,
      status: 'completed',
      finalResultKey: 'r1',
      stages: [],
      isTest: false,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    await User.updateOne({ _id: adminId }, { $set: { welcomeSeenAt: new Date('2026-10-01') } });
    await playQuizToEnd(w.admin, w.quizId);

    await w.admin.delete(url).expect(200);

    expect(await UserProgress.countDocuments({ userId: adminId })).toBe(1);
    const progress = await UserProgress.findOne({ userId: adminId }).lean();
    expect(progress?.completed).toHaveLength(1);
    expect(progress?.unlocked).toHaveLength(1);
    expect(progress?.bookCompletedAt).toBeDefined();
    expect(await ExtraAccess.countDocuments({ userId: adminId })).toBe(1);
    expect((await User.findById(adminId).lean())?.welcomeSeenAt).toEqual(new Date('2026-10-01'));
    expect(await QuizAttempt.countDocuments({ userId: adminId, isTest: false })).toBe(1);
    expect(await QuizAttempt.countDocuments({ userId: adminId, isTest: true })).toBe(0);
  });

  it('solo el equipo: sin sesión 401 y lector 403, y no borran nada', async () => {
    const w = await world();
    await playQuizToEnd(w.admin, w.quizId);
    await playQuizToEnd(w.reader, w.quizId);
    expect((await w.visitor.delete(url)).status).toBe(401);
    expect((await w.reader.delete(url)).status).toBe(403);
    expect(await QuizAttempt.countDocuments()).toBe(2);
    await w.editor.delete(url).expect(200);
  });

  it('no acepta ningún dato del cliente: ni userId en la consulta ni en el cuerpo ni nada más (400)', async () => {
    const w = await world();
    await playQuizToEnd(w.admin, w.quizId);
    await playQuizToEnd(w.editor, w.quizId);
    const otherId = w.editorUser._id.toString();
    const tries = [
      await w.admin.delete(`${url}?userId=${otherId}`),
      await w.admin.delete(`${url}?all=true`),
      await w.admin.delete(url).send({ userId: otherId }),
      await w.admin.delete(url).send({ isTest: false }),
    ];
    for (const res of tries) expect(res.status).toBe(400);
    // Nada se borró (ni lo del equipo ni lo de la otra cuenta).
    expect(await QuizAttempt.countDocuments({ isTest: true })).toBe(2);
    await w.admin.delete(url).send({}).expect(200);
    expect(await QuizAttempt.countDocuments({ userId: w.editorUser._id })).toBe(1);
  });

  it('registra solo quién y cuántos (sin contenido, correos ni tokens)', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => void lines.push(line) });
    const w = await world({ logger });
    await playQuizToEnd(w.admin, w.quizId);
    await w.admin.delete(url).expect(200);
    const line = lines.find((l) => l.includes('Progreso de prueba reiniciado')) ?? '';
    expect(line).toContain('"quizAttempts":1');
    expect(line).toContain(w.adminUser._id.toString());
    expect(line).not.toMatch(/admin@ejemplo|token|cookie|password/i);
  });
});
