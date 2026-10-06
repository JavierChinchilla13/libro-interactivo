import {
  quizContentSchema,
  type AttemptResponse,
  type PublishQuizResponse,
  type QuizContent,
  type QuizIssue,
  type QuizValidationResponse,
} from '@libro/shared';
import { canonicalJson } from '../lib/canonicalJson.js';
import type { Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import { sha256Hex } from '../lib/crypto.js';
import { isDuplicateKey } from '../lib/mongoErrors.js';
import { Quiz } from '../models/Quiz.js';
import { QuizVersion } from '../models/QuizVersion.js';
import type { Actor } from './progress.service.js';
import type { QuizService } from './quiz.service.js';
import { validateQuizContent } from './quiz-engine.js';
import { sanitizeQuizHtml } from './quizContent.js';

/** Hash (SHA-256) del contenido canónico: detecta publicar sin cambios y borradores distintos de lo publicado. */
export function hashQuizContent(content: QuizContent): string {
  return `sha256:${sha256Hex(canonicalJson(content))}`;
}

/** Contenido del borrador de un quiz tal como está guardado (aún sin validar). */
export function draftContentOf(quiz: {
  title: string;
  instructionsHtml: string;
  image?: unknown;
  settings: unknown;
  draft?: { stages?: unknown; results?: unknown } | null | undefined;
}): unknown {
  return {
    title: quiz.title,
    instructionsHtml: quiz.instructionsHtml,
    ...(quiz.image ? { image: quiz.image } : {}),
    settings: quiz.settings,
    stages: quiz.draft?.stages ?? [],
    results: quiz.draft?.results ?? [],
  };
}

type Checked =
  | { ok: true; content: QuizContent; warnings: QuizIssue[] }
  | { ok: false; errors: QuizIssue[]; warnings: QuizIssue[] };

export interface QuizPublishDeps {
  clock: Clock;
  quizzes: QuizService;
}

/**
 * Validación y publicación de quizzes (admin). Publicar valida de forma estricta y congela el borrador en un
 * snapshot inmutable (`quizVersions`); desde ese momento los lectores ven esa versión y los intentos nuevos
 * apuntan a ella. Los intentos anteriores siguen apuntando a la suya.
 */
export function createQuizPublishService(deps: QuizPublishDeps) {
  async function check(quizId: string) {
    const quiz = await Quiz.findById(quizId).lean();
    if (!quiz) throw new AppError('NOT_FOUND', 'No encontramos ese quiz');
    const parsed = quizContentSchema.safeParse(draftContentOf(quiz));
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({
        code: 'SCHEMA',
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return { quiz, checked: { ok: false, errors, warnings: [] } satisfies Checked };
    }
    // El HTML ya se sanea al guardar el borrador; se vuelve a sanear al publicar por si el borrador vino de otra vía (seed).
    const content = sanitizeQuizHtml(parsed.data);
    const { errors, warnings } = validateQuizContent(content);
    const checked: Checked =
      errors.length > 0 ? { ok: false, errors, warnings } : { ok: true, content, warnings };
    return { quiz, checked };
  }

  async function validate(quizId: string): Promise<QuizValidationResponse> {
    const { checked } = await check(quizId);
    return checked.ok
      ? { valid: true, errors: [], warnings: checked.warnings }
      : { valid: false, errors: checked.errors, warnings: checked.warnings };
  }

  async function publish(actor: Actor, quizId: string): Promise<PublishQuizResponse> {
    const { quiz, checked } = await check(quizId);
    if (quiz.status === 'archived') {
      throw new AppError('CONFLICT', 'Un quiz archivado no se puede publicar');
    }
    if (!checked.ok) {
      const first = checked.errors.slice(0, 3).map((issue) => issue.message);
      const more = checked.errors.length > 3 ? ` (y ${checked.errors.length - 3} más)` : '';
      throw new AppError('VALIDATION', `El quiz tiene errores: ${first.join('; ')}${more}`);
    }

    const contentHash = hashQuizContent(checked.content);
    const last = await QuizVersion.findOne({ quizId })
      .sort({ version: -1 })
      .select('version contentHash')
      .lean();
    if (last?.contentHash === contentHash && quiz.status === 'published') {
      throw new AppError('CONFLICT', 'No hay cambios desde la última versión publicada');
    }
    const version = Math.max(quiz.currentVersion, last?.version ?? 0) + 1;
    const publishedAt = deps.clock();
    try {
      await QuizVersion.create({
        quizId: quiz._id,
        bookId: quiz.bookId,
        version,
        title: checked.content.title,
        instructionsHtml: checked.content.instructionsHtml,
        ...(checked.content.image ? { image: checked.content.image } : {}),
        settings: checked.content.settings,
        stages: checked.content.stages,
        results: checked.content.results,
        publishedAt,
        publishedBy: actor.userId,
        contentHash,
      });
    } catch (error) {
      if (isDuplicateKey(error)) throw new AppError('CONFLICT', 'Otra publicación está en curso');
      throw error;
    }
    const moved = await Quiz.updateOne(
      { _id: quizId, currentVersion: quiz.currentVersion },
      { $set: { status: 'published', currentVersion: version, lastPublishedAt: publishedAt } },
    );
    if (moved.matchedCount === 0) throw new AppError('CONFLICT', 'Otra publicación está en curso');

    return {
      quizId,
      version,
      publishedAt: publishedAt.toISOString(),
      warnings: checked.warnings,
    };
  }

  /** Arranca un intento de prueba (`isTest`) sobre la versión publicada; no cuenta en progreso ni estadísticas. */
  async function preview(actor: Actor, quizId: string): Promise<AttemptResponse> {
    const quiz = await Quiz.findById(quizId).select('currentVersion status').lean();
    if (!quiz) throw new AppError('NOT_FOUND', 'No encontramos ese quiz');
    if (quiz.currentVersion < 1 || quiz.status !== 'published') {
      throw new AppError('CONFLICT', 'Publica el quiz al menos una vez para poder probarlo');
    }
    return deps.quizzes.startAttempt(actor, quizId);
  }

  return { validate, publish, preview };
}

export type QuizPublishService = ReturnType<typeof createQuizPublishService>;
