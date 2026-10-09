import { Types } from 'mongoose';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { UserProgress } from '../models/UserProgress.js';
import { ANONYMIZED_USER_ID } from '../services/userErasure.service.js';

/** Qué se corrigió (o se corregiría) en un avance. */
export interface ProgressRepairEntry {
  userId: string;
  bookId: string;
  /** Quizzes completados que faltaban en `userProgress.completed`. */
  missingQuizIds: string[];
  /** Quizzes cuyo «resultado vigente» no era el del último intento completado. */
  staleQuizIds: string[];
  /** `bookCompletedAt` que faltaba (todos los quizzes publicados completados). */
  bookCompletedAt?: string;
  /** Entradas de `completed` sin ningún intento completado que las respalde (solo se informan; no se borran). */
  orphanQuizIds: string[];
}

export interface ProgressRepairReport {
  applied: boolean;
  scanned: number;
  entries: ProgressRepairEntry[];
}

interface Done {
  firstCompletedAt: Date;
  currentAttemptId: Types.ObjectId;
  currentResultKey: string | undefined;
  currentAt: Date;
}

/**
 * Reconstruye `userProgress` a partir de los intentos completados (la fuente de verdad). Por defecto solo informa
 * (`apply: false`); con `apply: true` escribe de forma idempotente. Reglas:
 *  - Los intentos de prueba (`isTest`) y los anonimizados nunca cuentan.
 *  - `firstCompletedAt` = el primer intento completado; «resultado vigente» = el último.
 *  - `bookCompletedAt` solo se agrega (nunca se quita) cuando están completados todos los quizzes publicados.
 *  - Los desbloqueos por QR (`unlocked`) no se pueden derivar de los intentos: no se tocan.
 *  - Entradas sin intento que las respalde se informan como huérfanas pero no se eliminan.
 */
export async function repairProgress(
  options: { apply?: boolean; userId?: string } = {},
): Promise<ProgressRepairReport> {
  const apply = options.apply ?? false;
  const match: Record<string, unknown> = {
    status: 'completed',
    isTest: false,
    userId: { $ne: ANONYMIZED_USER_ID },
  };
  if (options.userId) match['userId'] = new Types.ObjectId(options.userId);

  const attempts = await QuizAttempt.find(match)
    .select('userId bookId quizId finalResultKey completedAt attemptNumber')
    .sort({ completedAt: 1, attemptNumber: 1 })
    .lean();

  // userId|bookId → quizId → resumen
  const expected = new Map<string, Map<string, Done>>();
  for (const attempt of attempts) {
    if (!attempt.completedAt) continue;
    const key = `${attempt.userId}|${attempt.bookId}`;
    const quizzes = expected.get(key) ?? new Map<string, Done>();
    const quizKey = attempt.quizId.toString();
    const found = quizzes.get(quizKey);
    quizzes.set(quizKey, {
      firstCompletedAt: found?.firstCompletedAt ?? attempt.completedAt,
      currentAttemptId: attempt._id,
      currentResultKey: attempt.finalResultKey ?? undefined,
      currentAt: attempt.completedAt,
    });
    expected.set(key, quizzes);
  }

  const publishedByBook = new Map<string, string[]>();
  const published = await Quiz.find({ status: 'published', currentVersion: { $gte: 1 } })
    .select('_id bookId')
    .lean();
  for (const quiz of published) {
    const list = publishedByBook.get(quiz.bookId.toString()) ?? [];
    list.push(quiz._id.toString());
    publishedByBook.set(quiz.bookId.toString(), list);
  }

  const entries: ProgressRepairEntry[] = [];
  const progressDocs = await UserProgress.find(
    options.userId ? { userId: new Types.ObjectId(options.userId) } : {},
  ).lean();
  const seen = new Set<string>();

  const handle = async (
    userId: string,
    bookId: string,
    doc: (typeof progressDocs)[number] | undefined,
  ) => {
    const quizzes = expected.get(`${userId}|${bookId}`) ?? new Map<string, Done>();
    const have = new Map(
      (doc?.completed ?? []).filter((c) => c.kind === 'quiz').map((c) => [c.refId.toString(), c]),
    );
    const entry: ProgressRepairEntry = {
      userId,
      bookId,
      missingQuizIds: [],
      staleQuizIds: [],
      orphanQuizIds: [],
    };

    for (const [quizId, done] of quizzes) {
      const current = have.get(quizId);
      if (!current) entry.missingQuizIds.push(quizId);
      else if (
        current.currentAttemptId.toString() !== done.currentAttemptId.toString() ||
        (current.currentResultKey ?? undefined) !== done.currentResultKey
      ) {
        entry.staleQuizIds.push(quizId);
      }
    }
    for (const quizId of have.keys()) if (!quizzes.has(quizId)) entry.orphanQuizIds.push(quizId);

    const mustFinish = publishedByBook.get(bookId) ?? [];
    if (
      !doc?.bookCompletedAt &&
      mustFinish.length > 0 &&
      mustFinish.every((quizId) => quizzes.has(quizId) || have.has(quizId))
    ) {
      const times = mustFinish.map((quizId) => {
        const fromAttempts = quizzes.get(quizId)?.firstCompletedAt;
        return (fromAttempts ?? have.get(quizId)?.firstCompletedAt ?? new Date(0)).getTime();
      });
      entry.bookCompletedAt = new Date(Math.max(...times)).toISOString();
    }

    const changed =
      entry.missingQuizIds.length > 0 ||
      entry.staleQuizIds.length > 0 ||
      entry.bookCompletedAt !== undefined;
    if (changed || entry.orphanQuizIds.length > 0) entries.push(entry);
    if (!changed || !apply) return;

    const writes = [...entry.missingQuizIds, ...entry.staleQuizIds].map((quizId) => ({
      quizId,
      done: quizzes.get(quizId)!,
    }));
    for (const { quizId, done } of writes) {
      const ref = new Types.ObjectId(quizId);
      const value = {
        kind: 'quiz' as const,
        refId: ref,
        firstCompletedAt: have.get(quizId)?.firstCompletedAt ?? done.firstCompletedAt,
        currentAttemptId: done.currentAttemptId,
        ...(done.currentResultKey ? { currentResultKey: done.currentResultKey } : {}),
      };
      const updated = await UserProgress.updateOne(
        { userId, bookId, completed: { $elemMatch: { kind: 'quiz', refId: ref } } },
        {
          $set: {
            'completed.$.currentAttemptId': value.currentAttemptId,
            'completed.$.firstCompletedAt': value.firstCompletedAt,
            ...(value.currentResultKey
              ? { 'completed.$.currentResultKey': value.currentResultKey }
              : {}),
          },
        },
      );
      if (updated.matchedCount === 0) {
        await UserProgress.updateOne(
          { userId, bookId },
          { $push: { completed: value } },
          { upsert: true },
        );
      }
    }
    if (entry.bookCompletedAt) {
      await UserProgress.updateOne(
        { userId, bookId, bookCompletedAt: { $exists: false } },
        { $set: { bookCompletedAt: new Date(entry.bookCompletedAt) } },
      );
    }
  };

  for (const doc of progressDocs) {
    const key = `${doc.userId}|${doc.bookId}`;
    seen.add(key);
    await handle(doc.userId.toString(), doc.bookId.toString(), doc);
  }
  // Personas con intentos completados pero sin documento de avance.
  for (const key of expected.keys()) {
    if (seen.has(key)) continue;
    const [userId, bookId] = key.split('|') as [string, string];
    await handle(userId, bookId, undefined);
  }

  return {
    applied: apply,
    scanned: seen.size + [...expected.keys()].filter((k) => !seen.has(k)).length,
    entries,
  };
}
