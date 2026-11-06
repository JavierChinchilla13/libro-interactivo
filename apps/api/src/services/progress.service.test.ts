import { libro1Story } from '@libro/game-core';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { Book } from '../models/Book.js';
import { Quiz } from '../models/Quiz.js';
import { UserProgress } from '../models/UserProgress.js';
import { seedGameStory } from '../seed/gameStory.js';
import { createUser } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';
import { createProgressService } from './progress.service.js';

useTestDb();

const AT = new Date('2026-11-05T12:00:00Z');

/** Libro publicado con `quizzes` quizzes publicados (en orden) y, si se pide, la historia del juego. */
async function world(options: { quizzes?: number; game?: boolean } = {}) {
  const admin = await createUser({ email: 'admin@ejemplo.com', role: 'ADMIN' });
  const user = await createUser();
  const book = await createBook();
  const quizzes = [];
  for (let order = 1; order <= (options.quizzes ?? 0); order += 1) {
    quizzes.push(
      await createQuiz({
        bookId: book._id,
        order,
        content: simpleContent({ title: `Quiz ${order}` }),
        publishedBy: admin._id,
      }),
    );
  }
  const story = options.game
    ? await seedGameStory({ bookId: book.id, story: libro1Story })
    : undefined;
  return {
    admin,
    user,
    userId: user._id.toString(),
    book,
    bookId: book._id.toString(),
    quizzes,
    story,
  };
}

const completeQuiz = (
  service: ReturnType<typeof createProgressService>,
  input: { userId: string; bookId: string; quizId: string },
) =>
  service.recordQuizCompletion({
    ...input,
    attemptId: new Types.ObjectId().toString(),
    resultKey: 'r1',
    at: AT,
  });

const completeGame = (
  service: ReturnType<typeof createProgressService>,
  input: { userId: string; bookId: string; storyId: string },
) =>
  service.recordGameCompletion({
    ...input,
    sessionId: new Types.ObjectId().toString(),
    endingKey: 'evacuacion',
    at: AT,
  });

describe('progreso: acceso al juego', () => {
  it('con el libro en borrador la lectora recibe 404 aunque la historia esté publicada; el personal sí entra', async () => {
    const service = createProgressService({ requireQrUnlock: false });
    const { admin, userId, book, bookId } = await world({ game: true });
    await Book.updateOne({ _id: book._id }, { $set: { status: 'draft' } });

    await expect(service.assertGameAccess({ userId, role: 'USER' }, bookId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const story = await service.assertGameAccess(
      { userId: admin._id.toString(), role: 'ADMIN' },
      bookId,
    );
    expect(story.title).toBe(libro1Story.title);
  });
});

describe('progreso: libros abiertos con QR obligatorio', () => {
  it('cuenta como abierto el libro donde ya completó algo aunque no tenga desbloqueos', async () => {
    const service = createProgressService({ requireQrUnlock: true });
    const { userId, bookId, quizzes } = await world({ quizzes: 1 });
    const other = await createBook({ slug: 'libro-2' });
    const otherId = other._id.toString();

    // Avance anterior a exigir QR: completó el quiz sin canjear ningún código.
    await completeQuiz(service, { userId, bookId, quizId: quizzes[0]!._id.toString() });
    expect((await UserProgress.findOne({ userId, bookId }).lean())?.unlocked).toEqual([]);

    const opened = await service.openedBooks({ userId, role: 'USER' }, [bookId, otherId]);
    expect([...opened]).toEqual([bookId]);
  });
});

describe('progreso: el juego en el avance del libro', () => {
  it('sin avance previo y sin quizzes, el juego aparece disponible', async () => {
    const service = createProgressService({ requireQrUnlock: false });
    const { userId, bookId, story } = await world({ game: true });

    const progress = await service.getProgress(userId, bookId);
    expect(progress.experiences).toEqual([
      expect.objectContaining({ kind: 'game', id: story!.id, status: 'available', order: 1 }),
    ]);
    expect(progress.experiences[0]).not.toHaveProperty('lockedBy');
    expect(progress.bookCompleted).toBe(false);
  });

  it('con QR obligatorio, completados los quizzes el juego espera su propio código y se abre al canjearlo', async () => {
    const service = createProgressService({ requireQrUnlock: true });
    const { userId, bookId, quizzes, story } = await world({ quizzes: 1, game: true });
    const quizId = quizzes[0]!._id.toString();
    await service.unlock({
      userId,
      bookId,
      kind: 'quiz',
      refId: quizId,
      accessTokenId: new Types.ObjectId().toString(),
      at: AT,
    });
    await completeQuiz(service, { userId, bookId, quizId });

    const before = await service.getProgress(userId, bookId);
    expect(before.experiences.map((e) => e.status)).toEqual(['completed', 'locked']);
    expect(before.experiences[1]).toMatchObject({ kind: 'game', lockedBy: { reason: 'qr' } });

    await service.unlock({
      userId,
      bookId,
      kind: 'game',
      refId: story!.id,
      accessTokenId: new Types.ObjectId().toString(),
      at: AT,
    });
    const after = await service.getProgress(userId, bookId);
    expect(after.experiences[1]).toMatchObject({ kind: 'game', status: 'available' });
    expect(after.experiences[1]).not.toHaveProperty('lockedBy');
  });
});

describe('progreso: cierre del libro', () => {
  it('con juego publicado, completar todos los quizzes no cierra el libro hasta terminar el juego', async () => {
    const service = createProgressService({ requireQrUnlock: false });
    const { userId, bookId, quizzes, story } = await world({ quizzes: 1, game: true });

    await completeQuiz(service, { userId, bookId, quizId: quizzes[0]!._id.toString() });
    expect(await service.isBookCompleted(userId, bookId)).toBe(false);
    await expect(service.assertBookCompleted(userId, bookId)).rejects.toMatchObject({
      code: 'NOT_UNLOCKED',
    });

    await completeGame(service, { userId, bookId, storyId: story!.id });
    expect(await service.isBookCompleted(userId, bookId)).toBe(true);
    expect((await UserProgress.findOne({ userId, bookId }).lean())?.bookCompletedAt).toEqual(AT);
  });

  it('si la autora archiva el único quiz mientras alguien lo responde, se registra la completación pero el libro no se cierra', async () => {
    const service = createProgressService({ requireQrUnlock: false });
    const { userId, bookId, quizzes } = await world({ quizzes: 1 });
    const quizId = quizzes[0]!._id.toString();
    await Quiz.updateOne({ _id: quizId }, { $set: { status: 'archived' } });

    await completeQuiz(service, { userId, bookId, quizId });

    const progress = await UserProgress.findOne({ userId, bookId }).lean();
    expect(progress?.completed.map((c) => c.refId.toString())).toEqual([quizId]);
    expect(progress?.bookCompletedAt).toBeUndefined();
  });
});
