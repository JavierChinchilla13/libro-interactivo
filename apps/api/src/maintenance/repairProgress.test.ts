import type { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { UserProgress } from '../models/UserProgress.js';
import { ANONYMIZED_USER_ID } from '../services/userErasure.service.js';
import { createUser } from '../test-utils/auth.js';
import { useTestDb } from '../test-utils/db.js';
import { createBook, createQuiz, simpleContent } from '../test-utils/quizFixtures.js';
import { repairProgress } from './repairProgress.js';

useTestDb();

const at = (day: number) => new Date(`2026-10-0${day}T10:00:00.000Z`);

async function scenario() {
  const reader = await createUser({ email: 'lectora@ejemplo.com' });
  const book = await createBook();
  const q1 = await createQuiz({
    bookId: book._id,
    order: 1,
    content: simpleContent({ title: 'Uno' }),
    publishedBy: reader._id,
  });
  const q2 = await createQuiz({
    bookId: book._id,
    order: 2,
    content: simpleContent({ title: 'Dos' }),
    publishedBy: reader._id,
  });
  const version = (quizId: Types.ObjectId) => QuizVersion.findOne({ quizId }).orFail();
  const attempt = async (quiz: typeof q1, over: Record<string, unknown> = {}) =>
    QuizAttempt.create({
      userId: reader._id,
      bookId: book._id,
      quizId: quiz._id,
      quizVersionId: (await version(quiz._id))._id,
      version: 1,
      attemptNumber: 1,
      status: 'completed',
      finalResultKey: 'r1',
      isTest: false,
      startedAt: at(1),
      completedAt: at(1),
      ...over,
    });
  return { reader, book, q1, q2, attempt };
}

describe('repairProgress', () => {
  it('por defecto solo informa y no escribe nada', async () => {
    const { reader, book, q1, attempt } = await scenario();
    await attempt(q1);
    const report = await repairProgress();
    expect(report.applied).toBe(false);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]).toMatchObject({
      userId: String(reader._id),
      bookId: String(book._id),
      missingQuizIds: [String(q1._id)],
    });
    expect(await UserProgress.countDocuments()).toBe(0);
  });

  it('crea el avance que faltaba con el primer y el último intento, y es idempotente', async () => {
    const { reader, q1, attempt } = await scenario();
    await attempt(q1, { attemptNumber: 1, finalResultKey: 'r1', completedAt: at(1) });
    const last = await attempt(q1, { attemptNumber: 2, finalResultKey: 'r2', completedAt: at(3) });

    expect((await repairProgress({ apply: true })).entries).toHaveLength(1);
    const doc = await UserProgress.findOne({ userId: reader._id }).orFail();
    expect(doc.completed).toHaveLength(1);
    expect(doc.completed[0]).toMatchObject({ currentResultKey: 'r2' });
    expect(String(doc.completed[0]?.currentAttemptId)).toBe(String(last._id));
    expect(doc.completed[0]?.firstCompletedAt.toISOString()).toBe(at(1).toISOString());

    const second = await repairProgress({ apply: true });
    expect(second.entries).toHaveLength(0);
    expect(await UserProgress.countDocuments()).toBe(1);
  });

  it('corrige un resultado vigente desactualizado sin tocar la primera fecha', async () => {
    const { reader, book, q1, attempt } = await scenario();
    const first = await attempt(q1, { attemptNumber: 1, finalResultKey: 'r1', completedAt: at(1) });
    const last = await attempt(q1, { attemptNumber: 2, finalResultKey: 'r2', completedAt: at(4) });
    await UserProgress.create({
      userId: reader._id,
      bookId: book._id,
      completed: [
        {
          kind: 'quiz',
          refId: q1._id,
          firstCompletedAt: at(1),
          currentAttemptId: first._id,
          currentResultKey: 'r1',
        },
      ],
    });
    const report = await repairProgress({ apply: true });
    expect(report.entries[0]?.staleQuizIds).toEqual([String(q1._id)]);
    const doc = await UserProgress.findOne({ userId: reader._id }).orFail();
    expect(String(doc.completed[0]?.currentAttemptId)).toBe(String(last._id));
    expect(doc.completed[0]?.currentResultKey).toBe('r2');
    expect(doc.completed[0]?.firstCompletedAt.toISOString()).toBe(at(1).toISOString());
  });

  it('fija bookCompletedAt cuando están todos los quizzes publicados y nunca lo quita', async () => {
    const { reader, book, q1, q2, attempt } = await scenario();
    await attempt(q1, { completedAt: at(1) });
    await attempt(q2, { completedAt: at(5) });
    await repairProgress({ apply: true });
    const doc = await UserProgress.findOne({ userId: reader._id }).orFail();
    expect(doc.bookCompletedAt?.toISOString()).toBe(at(5).toISOString());
    // Si la persona ya tenía una fecha, se respeta.
    await UserProgress.updateOne({ _id: doc._id }, { $set: { bookCompletedAt: at(2) } });
    const again = await repairProgress({ apply: true });
    expect(again.entries).toHaveLength(0);
    expect((await UserProgress.findById(doc._id).orFail()).bookCompletedAt?.toISOString()).toBe(
      at(2).toISOString(),
    );
    expect(String(book._id)).toBeTruthy();
  });

  it('con un quiz publicado sin completar no marca el libro como completado', async () => {
    const { reader, q1, attempt } = await scenario();
    await attempt(q1);
    await repairProgress({ apply: true });
    expect(
      (await UserProgress.findOne({ userId: reader._id }).orFail()).bookCompletedAt,
    ).toBeUndefined();
  });

  it('ignora intentos de prueba, en curso y anonimizados', async () => {
    const { q1, attempt } = await scenario();
    await attempt(q1, { isTest: true });
    await attempt(q1, {
      attemptNumber: 2,
      status: 'in_progress',
      finalResultKey: undefined,
      completedAt: undefined,
    });
    await attempt(q1, { attemptNumber: 3, userId: ANONYMIZED_USER_ID });
    const report = await repairProgress({ apply: true });
    expect(report.entries).toHaveLength(0);
    expect(await UserProgress.countDocuments()).toBe(0);
  });

  it('informa las entradas sin intento que las respalde pero no las borra', async () => {
    const { reader, book, q1 } = await scenario();
    await UserProgress.create({
      userId: reader._id,
      bookId: book._id,
      completed: [
        { kind: 'quiz', refId: q1._id, firstCompletedAt: at(1), currentAttemptId: q1._id },
      ],
    });
    const report = await repairProgress({ apply: true });
    expect(report.entries[0]?.orphanQuizIds).toEqual([String(q1._id)]);
    expect((await UserProgress.findOne({ userId: reader._id }).orFail()).completed).toHaveLength(1);
  });

  it('puede limitarse a una persona', async () => {
    const { reader, q1, attempt } = await scenario();
    await attempt(q1);
    const other = await createUser({ email: 'otra@ejemplo.com' });
    const none = await repairProgress({ apply: true, userId: String(other._id) });
    expect(none.entries).toHaveLength(0);
    expect(await UserProgress.countDocuments()).toBe(0);
    const some = await repairProgress({ apply: true, userId: String(reader._id) });
    expect(some.entries).toHaveLength(1);
  });

  it('no toca los desbloqueos por QR', async () => {
    const { reader, book, q1, q2, attempt } = await scenario();
    await attempt(q1);
    await UserProgress.create({
      userId: reader._id,
      bookId: book._id,
      unlocked: [{ kind: 'quiz', refId: q2._id, at: at(1) }],
    });
    await repairProgress({ apply: true });
    const doc = await UserProgress.findOne({ userId: reader._id }).orFail();
    expect(doc.unlocked).toHaveLength(1);
    expect(doc.completed).toHaveLength(1);
  });
});
