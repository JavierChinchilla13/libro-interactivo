import {
  quizContentSchema,
  type AttemptResponse,
  type QuizContent,
  type QuizIntroResponse,
  type QuizResultsResponse,
  type ResultsListResponse,
  type SubmitAnswersRequest,
} from '@libro/shared';
import type { QueryFilter, Types } from 'mongoose';
import { addDays, type Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import { isDuplicateKey } from '../lib/mongoErrors.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt, type QuizAttemptAttrs } from '../models/QuizAttempt.js';
import { QuizVersion } from '../models/QuizVersion.js';
import {
  computeDistribution,
  findResult,
  firstStage,
  nextStage,
  pickWinner,
  questionOrderFor,
  resolveStageAnswers,
  tallyAnswers,
  toResultPayload,
  toStagePayload,
  type RandomInt,
} from './quiz-engine.js';
import { isStaff, type Actor, type ProgressService } from './progress.service.js';

/** Los intentos sin terminar caducan (TTL) a los 7 días de su última actividad. */
export const IN_PROGRESS_TTL_DAYS = 7;

export interface QuizServiceDeps {
  progress: ProgressService;
  clock: Clock;
  random: RandomInt;
}

/** Reconstruye el contenido de un snapshot (y lo revalida: nunca se confía ciegamente en lo guardado). */
export function contentOf(version: {
  title: string;
  instructionsHtml: string;
  image?: unknown;
  settings: unknown;
  stages: unknown;
  results: unknown;
}): QuizContent {
  return quizContentSchema.parse({
    title: version.title,
    instructionsHtml: version.instructionsHtml,
    ...(version.image ? { image: version.image } : {}),
    settings: version.settings,
    stages: version.stages,
    results: version.results,
  });
}

/**
 * Quizzes del lector. El servidor baraja, cuenta y decide el resultado; el cliente
 * solo envía respuestas. Nada de lo que se entrega antes de completar incluye `resultKey`.
 */
export function createQuizService(deps: QuizServiceDeps) {
  const { progress, clock, random } = deps;

  async function loadVersionById(versionId: Types.ObjectId | string) {
    const version = await QuizVersion.findById(versionId).lean();
    if (!version) throw new AppError('INTERNAL', 'No se encontró la versión del quiz');
    return { version, content: contentOf(version) };
  }

  async function loadPublished(quizId: string) {
    const quiz = await Quiz.findById(quizId).lean();
    if (!quiz || quiz.status !== 'published' || quiz.currentVersion < 1) {
      throw new AppError('NOT_FOUND', 'No encontramos ese quiz');
    }
    const version = await QuizVersion.findOne({ quizId, version: quiz.currentVersion }).lean();
    if (!version) throw new AppError('INTERNAL', 'No se encontró la versión publicada del quiz');
    return { quiz, version, content: contentOf(version) };
  }

  /** Etapa en curso de un intento abierto, lista para entregar. */
  function currentStagePayload(
    attempt: { _id: Types.ObjectId; stages: { stageId: string; questionOrder: string[] }[] },
    content: QuizContent,
  ): AttemptResponse {
    const entry = attempt.stages[attempt.stages.length - 1];
    const stage = content.stages.find((candidate) => candidate.id === entry?.stageId);
    if (!entry || !stage) throw new AppError('INTERNAL', 'El intento no tiene una etapa en curso');
    return {
      attemptId: attempt._id.toString(),
      status: 'in_progress',
      stage: toStagePayload(stage, entry.questionOrder),
    };
  }

  async function getIntro(actor: Actor, quizId: string): Promise<QuizIntroResponse> {
    const { quiz, content } = await loadPublished(quizId);
    const isTest = isStaff(actor.role);
    const [completedCount, open] = await Promise.all([
      QuizAttempt.countDocuments({ userId: actor.userId, quizId, status: 'completed', isTest }),
      QuizAttempt.findOne({ userId: actor.userId, quizId, status: 'in_progress', isTest })
        .select('_id')
        .lean(),
    ]);
    const allowRetake = content.settings.allowRetake;
    return {
      id: quiz._id.toString(),
      bookId: quiz.bookId.toString(),
      title: content.title,
      instructionsHtml: content.instructionsHtml,
      ...(content.image ? { image: content.image } : {}),
      allowRetake,
      status: completedCount > 0 ? 'completed' : 'available',
      completedCount,
      ...(open ? { inProgressAttemptId: open._id.toString() } : {}),
      canStart: isTest || allowRetake || completedCount === 0,
    };
  }

  /**
   * Inicia un intento (o reanuda el que está abierto). Fija la versión publicada vigente y baraja la etapa
   * inicial. Si el quiz es de una sola vez y ya se completó ⇒ 409. Las editoras/administradoras juegan en
   * modo prueba (`isTest`).
   */
  async function startAttempt(actor: Actor, quizId: string): Promise<AttemptResponse> {
    const { quiz, version, content } = await loadPublished(quizId);
    const isTest = isStaff(actor.role);
    const mine = { userId: actor.userId, quizId, isTest };

    const open = await QuizAttempt.findOne({ ...mine, status: 'in_progress' }).lean();
    if (open) {
      const openContent =
        open.quizVersionId.equals(version._id) ? content : (await loadVersionById(open.quizVersionId)).content;
      return currentStagePayload(open, openContent);
    }

    if (!isTest && !content.settings.allowRetake) {
      if (await QuizAttempt.exists({ ...mine, status: 'completed' })) {
        throw new AppError('CONFLICT', 'Este quiz solo se puede jugar una vez');
      }
    }

    const first = firstStage(content);
    if (!first) throw new AppError('INTERNAL', 'El quiz no tiene etapa inicial');
    const last = await QuizAttempt.findOne(mine).sort({ attemptNumber: -1 }).select('attemptNumber').lean();
    const now = clock();
    const order = questionOrderFor(first, random);
    try {
      const attempt = await QuizAttempt.create({
        userId: actor.userId,
        bookId: quiz.bookId,
        quizId: quiz._id,
        quizVersionId: version._id,
        version: version.version,
        attemptNumber: (last?.attemptNumber ?? 0) + 1,
        status: 'in_progress',
        stages: [{ stageId: first.id, questionOrder: order }],
        isTest,
        startedAt: now,
        expireAt: addDays(now, IN_PROGRESS_TTL_DAYS),
      });
      return currentStagePayload({ _id: attempt._id, stages: attempt.stages }, content);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // Dos "iniciar" a la vez: gana uno; el otro reanuda el intento que quedó abierto.
      const winner = await QuizAttempt.findOne({ ...mine, status: 'in_progress' }).lean();
      if (!winner) throw error;
      return currentStagePayload(winner, content);
    }
  }

  /**
   * Recibe las respuestas de la etapa en curso. El servidor valida que sean exactamente las preguntas de la
   * etapa, cuenta, resuelve empates al azar y devuelve la etapa siguiente o, al terminar, el resultado.
   */
  async function submitAnswers(
    actor: Actor,
    attemptId: string,
    stageId: string,
    request: SubmitAnswersRequest,
  ): Promise<AttemptResponse> {
    const attempt = await QuizAttempt.findOne({ _id: attemptId, userId: actor.userId }).lean();
    if (!attempt) throw new AppError('NOT_FOUND', 'No encontramos ese intento');
    if (attempt.status !== 'in_progress') throw new AppError('CONFLICT', 'Este intento ya terminó');
    await progress.assertQuizAccess(actor, attempt.quizId.toString());

    const { content } = await loadVersionById(attempt.quizVersionId);
    const index = attempt.stages.length - 1;
    const entry = attempt.stages[index];
    if (!entry || entry.stageId !== stageId || entry.completedAt) {
      throw new AppError('CONFLICT', 'Esa no es la etapa en curso de este intento');
    }
    const stage = content.stages.find((candidate) => candidate.id === stageId);
    if (!stage) throw new AppError('INTERNAL', 'La etapa no existe en esta versión del quiz');

    const checked = resolveStageAnswers(stage, request.answers);
    if (!checked.ok) throw new AppError('VALIDATION', checked.message);

    const now = clock();
    const tally = tallyAnswers(checked.answers);
    const winner = pickWinner(tally, random);
    const closed = {
      stageId: entry.stageId,
      questionOrder: entry.questionOrder,
      answers: checked.answers.map(({ questionId, answerId }) => ({
        questionId,
        answerId,
        answeredAt: now,
      })),
      tally,
      resultKey: winner.resultKey,
      ...(winner.tiedKeys ? { tiedKeys: winner.tiedKeys } : {}),
      completedAt: now,
    };
    const history = attempt.stages.slice(0, index).map((stored) => ({ ...stored }));

    // Solo prospera si nadie envió esta etapa antes (doble clic, dos pestañas): protege el conteo.
    const stillOpen = {
      _id: attempt._id,
      userId: actor.userId,
      status: 'in_progress',
      [`stages.${index}.completedAt`]: { $exists: false },
      [`stages.${index + 1}`]: { $exists: false },
    } as QueryFilter<QuizAttemptAttrs>;

    if (stage.producesFinal) {
      const distribution = computeDistribution(tally);
      const done = await QuizAttempt.findOneAndUpdate(
        stillOpen,
        {
          $set: {
            stages: [...history, closed],
            status: 'completed',
            finalResultKey: winner.resultKey,
            distribution,
            completedAt: now,
          },
          $unset: { expireAt: 1 },
        },
        { returnDocument: 'after' },
      ).lean();
      if (!done) throw new AppError('CONFLICT', 'Esta etapa ya se envió');

      if (!done.isTest) {
        await progress.recordQuizCompletion({
          userId: actor.userId,
          bookId: done.bookId.toString(),
          quizId: done.quizId.toString(),
          attemptId: done._id.toString(),
          resultKey: winner.resultKey,
          at: now,
        });
      }
      return {
        attemptId: done._id.toString(),
        status: 'completed',
        result: toResultPayload(content, winner.resultKey, distribution),
      };
    }

    const next = nextStage(content, stage.id, winner.resultKey);
    if (!next) throw new AppError('INTERNAL', 'El quiz no tiene cómo continuar desde este resultado');
    const nextEntry = { stageId: next.id, questionOrder: questionOrderFor(next, random) };
    const advanced = await QuizAttempt.findOneAndUpdate(
      stillOpen,
      {
        $set: {
          stages: [...history, closed, nextEntry],
          expireAt: addDays(now, IN_PROGRESS_TTL_DAYS),
        },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!advanced) throw new AppError('CONFLICT', 'Esta etapa ya se envió');
    return {
      attemptId: advanced._id.toString(),
      status: 'in_progress',
      stage: toStagePayload(next, nextEntry.questionOrder),
    };
  }

  /** Último intento completado de cada quiz del libro (los de prueba no cuentan). */
  async function listResults(userId: string, bookId: string): Promise<ResultsListResponse> {
    const attempts = await QuizAttempt.find({ userId, bookId, status: 'completed', isTest: false })
      .sort({ completedAt: -1 })
      .lean();
    const latest = new Map<string, (typeof attempts)[number]>();
    const counts = new Map<string, number>();
    for (const attempt of attempts) {
      const key = attempt.quizId.toString();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!latest.has(key)) latest.set(key, attempt);
    }
    if (latest.size === 0) return { results: [] };

    const [quizzes, versions] = await Promise.all([
      Quiz.find({ _id: { $in: [...latest.values()].map((a) => a.quizId) } })
        .select('order')
        .lean(),
      QuizVersion.find({ _id: { $in: [...latest.values()].map((a) => a.quizVersionId) } }).lean(),
    ]);
    const orderOf = new Map(quizzes.map((quiz) => [quiz._id.toString(), quiz.order]));
    const contentOfVersion = new Map(versions.map((v) => [v._id.toString(), contentOf(v)]));

    const results = [...latest.values()].flatMap((attempt) => {
      const content = contentOfVersion.get(attempt.quizVersionId.toString());
      const result = content && attempt.finalResultKey ? findResult(content, attempt.finalResultKey) : undefined;
      if (!content || !result || !attempt.completedAt) return [];
      const quizId = attempt.quizId.toString();
      return [
        {
          quizId,
          title: content.title,
          order: orderOf.get(quizId) ?? 0,
          attemptsCompleted: counts.get(quizId) ?? 1,
          completedAt: attempt.completedAt.toISOString(),
          resultTitle: result.title,
          ...(result.media ? { media: result.media } : {}),
        },
      ];
    });
    return { results: results.sort((a, b) => a.order - b.order) };
  }

  /** Resultado vigente (el del último intento completado) y el historial completo de un quiz. */
  async function getQuizResults(userId: string, quizId: string): Promise<QuizResultsResponse> {
    const attempts = await QuizAttempt.find({ userId, quizId, status: 'completed', isTest: false })
      .sort({ attemptNumber: -1 })
      .lean();
    const current = attempts[0];
    if (!current?.finalResultKey || !current.completedAt) {
      throw new AppError('NOT_FOUND', 'Todavía no tienes un resultado de este quiz');
    }
    const versions = await QuizVersion.find({
      _id: { $in: [...new Set(attempts.map((a) => a.quizVersionId.toString()))] },
    }).lean();
    const contents = new Map(versions.map((v) => [v._id.toString(), contentOf(v)]));
    const currentContent = contents.get(current.quizVersionId.toString());
    if (!currentContent) throw new AppError('INTERNAL', 'No se encontró la versión del quiz');

    const quiz = await Quiz.findById(quizId).select('currentVersion').lean();
    const published =
      quiz && quiz.currentVersion >= 1
        ? await QuizVersion.findOne({ quizId, version: quiz.currentVersion }).lean()
        : null;
    const allowRetake = (published ? contentOf(published) : currentContent).settings.allowRetake;

    return {
      quizId,
      title: currentContent.title,
      allowRetake,
      current: {
        attemptId: current._id.toString(),
        completedAt: current.completedAt.toISOString(),
        result: toResultPayload(currentContent, current.finalResultKey, current.distribution ?? undefined),
      },
      history: attempts.flatMap((attempt) => {
        const content = contents.get(attempt.quizVersionId.toString());
        const result =
          content && attempt.finalResultKey ? findResult(content, attempt.finalResultKey) : undefined;
        if (!result || !attempt.completedAt) return [];
        return [
          {
            attemptId: attempt._id.toString(),
            attemptNumber: attempt.attemptNumber,
            version: attempt.version,
            completedAt: attempt.completedAt.toISOString(),
            resultTitle: result.title,
          },
        ];
      }),
    };
  }

  return { getIntro, startAttempt, submitAnswers, listResults, getQuizResults };
}

export type QuizService = ReturnType<typeof createQuizService>;
