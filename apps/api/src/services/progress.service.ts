import type { ProgressResponse, Role } from '@libro/shared';
import { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { isDuplicateKey } from '../lib/mongoErrors.js';
import { Book } from '../models/Book.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { UserProgress } from '../models/UserProgress.js';

export interface Actor {
  userId: string;
  role: Role;
}

/** EDITOR y ADMIN pueden probarlo todo (sus intentos son de prueba y no cuentan). */
export function isStaff(role: Role): boolean {
  return role !== 'USER';
}

export interface ProgressDeps {
  /**
   * Exige además que la experiencia se haya desbloqueado escaneando su QR (fase 8).
   * Hasta entonces va apagado y solo rigen los prerrequisitos de progresión.
   */
  requireQrUnlock: boolean;
}

const NOT_UNLOCKED_MESSAGE = 'Aún no puedes acceder a este contenido';

/**
 * Progresión y acceso: quizzes publicados del libro en orden, el juego
 * siempre al final. Una experiencia se abre cuando todas las anteriores están completadas (y, desde la
 * fase 8, cuando su QR se canjeó). Es la única autoridad: el cliente nunca decide.
 */
export function createProgressService(deps: ProgressDeps) {
  /** Quizzes publicados anteriores a `order` que aún no completó. */
  async function pendingPrerequisites(
    bookId: Types.ObjectId,
    order: number,
    completed: ReadonlySet<string>,
  ): Promise<number> {
    const earlier = await Quiz.find({ bookId, status: 'published', order: { $lt: order } })
      .select('_id')
      .lean();
    return earlier.filter((quiz) => !completed.has(quiz._id.toString())).length;
  }

  /**
   * Comprueba que `actor` puede abrir el quiz. Lanza 404 si no existe o no está publicado (para lectores
   * también si su libro no lo está) y 403 `NOT_UNLOCKED` —sin contenido— si falta un prerrequisito.
   */
  async function assertQuizAccess(actor: Actor, quizId: string): Promise<void> {
    const quiz = await Quiz.findById(quizId).select('bookId order status currentVersion').lean();
    if (!quiz || quiz.status !== 'published' || quiz.currentVersion < 1) {
      throw new AppError('NOT_FOUND', 'No encontramos ese quiz');
    }
    if (isStaff(actor.role)) return;

    const book = await Book.findById(quiz.bookId).select('status').lean();
    if (book?.status !== 'published') throw new AppError('NOT_FOUND', 'No encontramos ese quiz');

    const progress = await UserProgress.findOne({ userId: actor.userId, bookId: quiz.bookId })
      .select('completed unlocked')
      .lean();
    const completed = new Set(
      (progress?.completed ?? []).filter((c) => c.kind === 'quiz').map((c) => c.refId.toString()),
    );
    if (await pendingPrerequisites(quiz.bookId, quiz.order, completed)) {
      throw new AppError('NOT_UNLOCKED', NOT_UNLOCKED_MESSAGE);
    }
    if (deps.requireQrUnlock) {
      const unlocked = (progress?.unlocked ?? []).some(
        (u) => u.kind === 'quiz' && u.refId.toString() === quizId,
      );
      if (!unlocked) throw new AppError('NOT_UNLOCKED', NOT_UNLOCKED_MESSAGE);
    }
  }

  /** Estado de cada quiz del libro para el dashboard (solo nombres y orden: nada de contenido). */
  async function getProgress(userId: string, bookId: string): Promise<ProgressResponse> {
    const book = await Book.findById(bookId).select('status').lean();
    if (book?.status !== 'published') throw new AppError('NOT_FOUND', 'No encontramos ese libro');

    const [quizzes, progress, open] = await Promise.all([
      Quiz.find({ bookId, status: 'published', currentVersion: { $gte: 1 } })
        .sort({ order: 1 })
        .select('title order currentVersion')
        .lean(),
      UserProgress.findOne({ userId, bookId }).lean(),
      QuizAttempt.find({ userId, bookId, status: 'in_progress', isTest: false })
        .select('quizId')
        .lean(),
    ]);
    const versions =
      quizzes.length === 0
        ? []
        : await QuizVersion.find({
            $or: quizzes.map((quiz) => ({ quizId: quiz._id, version: quiz.currentVersion })),
          })
            .select('quizId settings')
            .lean();
    const retake = new Map(
      versions.map((v) => [v.quizId.toString(), (v.settings as { allowRetake?: boolean }).allowRetake !== false]),
    );
    const completed = new Set(
      (progress?.completed ?? []).filter((c) => c.kind === 'quiz').map((c) => c.refId.toString()),
    );
    const unlocked = new Set(
      (progress?.unlocked ?? []).filter((u) => u.kind === 'quiz').map((u) => u.refId.toString()),
    );
    const inProgress = new Set(open.map((attempt) => attempt.quizId.toString()));

    let previousDone = true;
    const experiences = quizzes.map((quiz) => {
      const id = quiz._id.toString();
      const done = completed.has(id);
      const reachable = previousDone && (!deps.requireQrUnlock || unlocked.has(id));
      previousDone = previousDone && done;
      return {
        kind: 'quiz' as const,
        id,
        title: quiz.title,
        order: quiz.order,
        status: done ? ('completed' as const) : reachable ? ('available' as const) : ('locked' as const),
        inProgress: inProgress.has(id),
        allowRetake: retake.get(id) ?? true,
      };
    });
    return {
      bookId,
      experiences,
      bookCompleted: Boolean(progress?.bookCompletedAt),
    };
  }

  /**
   * Registra, de forma atómica, que el quiz quedó completado (los intentos de prueba nunca llegan aquí).
   * La primera vez agrega la entrada (`firstCompletedAt`); las siguientes solo actualizan el resultado vigente.
   */
  async function recordQuizCompletion(input: {
    userId: string;
    bookId: string;
    quizId: string;
    attemptId: string;
    resultKey: string;
    at: Date;
  }): Promise<void> {
    const entry = { kind: 'quiz', refId: new Types.ObjectId(input.quizId) };
    const updateCurrent = () =>
      UserProgress.updateOne(
        { userId: input.userId, bookId: input.bookId, completed: { $elemMatch: entry } },
        {
          $set: {
            'completed.$.currentAttemptId': new Types.ObjectId(input.attemptId),
            'completed.$.currentResultKey': input.resultKey,
          },
        },
      );

    if ((await updateCurrent()).matchedCount > 0) return;
    try {
      await UserProgress.updateOne(
        { userId: input.userId, bookId: input.bookId, completed: { $not: { $elemMatch: entry } } },
        {
          $push: {
            completed: {
              ...entry,
              firstCompletedAt: input.at,
              currentAttemptId: new Types.ObjectId(input.attemptId),
              currentResultKey: input.resultKey,
            },
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // El documento ya existía con la entrada (otra petición se adelantó): solo actualizar.
      await updateCurrent();
    }
  }

  return { assertQuizAccess, getProgress, recordQuizCompletion };
}

export type ProgressService = ReturnType<typeof createProgressService>;
