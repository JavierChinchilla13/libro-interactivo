import {
  quizContentSchema,
  type AttemptResponse,
  type PublishQuizResponse,
  type QuizContent,
  type QuizIssue,
  type QuizValidationResponse,
} from '@libro/shared';
import type { Types } from 'mongoose';
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
import { findPublishedFields } from './wikiField.js';

/**
 * Copia del contenido sin los valores por defecto que se añadieron DESPUÉS de las primeras versiones publicadas
 * (`shuffleAnswers: true` y `pinLast` ausente o `false`). Así el hash de una versión guardada antes de esos campos sigue
 * siendo válido: leerla con sus valores por defecto no cuenta como un cambio. Activar lo contrario (`shuffleAnswers:
 * false` o `pinLast: true`) sí cambia el hash. Nunca se toca el snapshot guardado: solo se normaliza una copia.
 */
function withoutLaterDefaults(content: QuizContent): QuizContent {
  const copy = structuredClone(content);
  for (const stage of copy.stages) {
    if (stage.shuffleAnswers === true)
      delete (stage as { shuffleAnswers?: boolean }).shuffleAnswers;
    for (const question of stage.questions) {
      for (const answer of question.answers) {
        if (answer.pinLast !== true) delete (answer as { pinLast?: boolean }).pinLast;
      }
    }
  }
  return copy;
}

/** Hash (SHA-256) del contenido canónico: detecta publicar sin cambios y borradores distintos de lo publicado. */
export function hashQuizContent(content: QuizContent): string {
  return `sha256:${sha256Hex(canonicalJson(withoutLaterDefaults(content)))}`;
}

/**
 * Hash del contenido tal cual, con todos sus valores por defecto: es el que se guardó en las versiones publicadas
 * mientras `shuffleAnswers` ya existía pero el hash aún no los ignoraba. Se sigue aceptando para esas versiones.
 */
function hashWithDefaults(content: QuizContent): string {
  return `sha256:${sha256Hex(canonicalJson(content))}`;
}

/** ¿Este contenido es el de la versión cuyo hash se guardó? (con o sin los valores por defecto añadidos después). */
export function isSameQuizContent(content: QuizContent, storedHash: string | undefined): boolean {
  return (
    storedHash !== undefined &&
    (storedHash === hashQuizContent(content) || storedHash === hashWithDefaults(content))
  );
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

/** Cuánto dura la reserva de publicación de un quiz (por si el servidor se cae a mitad de publicar). */
export const PUBLISH_LOCK_MS = 30_000;

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
  /**
   * Avisos (no errores) sobre el campo de poder de cada resultado: si no existe, no está publicado o no es de este
   * libro, el resultado simplemente no llevará fondo animado. Publicar sigue siendo posible.
   */
  async function fieldWarnings(bookId: Types.ObjectId, content: QuizContent): Promise<QuizIssue[]> {
    const slugs = [
      ...new Set(content.results.flatMap((result) => (result.fieldSlug ? [result.fieldSlug] : []))),
    ];
    if (slugs.length === 0) return [];
    const bySlug = await findPublishedFields(bookId, slugs);
    return content.results.flatMap((result, index): QuizIssue[] => {
      if (!result.fieldSlug) return [];
      const field = bySlug.get(result.fieldSlug);
      const path = `results.${index}.fieldSlug`;
      if (!field) {
        return [
          {
            code: 'FIELD_NOT_FOUND',
            path,
            message: `El campo «${result.fieldSlug}» no existe, no está publicado o no es de este libro: el resultado «${result.title}» no tendrá fondo animado.`,
          },
        ];
      }
      return field.visualKey
        ? []
        : [
            {
              code: 'FIELD_WITHOUT_VISUAL',
              path,
              message: `El campo «${result.fieldSlug}» no tiene fondo animado: elige uno en la wiki para que el resultado «${result.title}» lo muestre.`,
            },
          ];
    });
  }

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
    warnings.push(...(await fieldWarnings(quiz.bookId, content)));
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
    const publishedAt = deps.clock();
    const busy = () => new AppError('CONFLICT', 'Otra publicación está en curso');

    // Reserva del quiz: una publicación a la vez. Sin ella, dos publicaciones simultáneas podían leer el quiz antes de
    // que la otra lo actualizara y la última versión después de que la otra la creara: calculaban números distintos,
    // las dos versiones se guardaban y una quedaba huérfana (las versiones son inmutables: nunca se borran). Exigir el
    // mismo `currentVersion` que se leyó también rechaza a quien llega con el quiz ya desactualizado.
    const lockUntil = new Date(publishedAt.getTime() + PUBLISH_LOCK_MS);
    const claimed = await Quiz.updateOne(
      {
        _id: quizId,
        currentVersion: quiz.currentVersion,
        status: { $ne: 'archived' },
        $or: [
          { publishLockUntil: { $exists: false } },
          { publishLockUntil: { $lte: publishedAt } },
        ],
      },
      { $set: { publishLockUntil: lockUntil } },
    );
    if (claimed.matchedCount === 0) throw busy();

    try {
      const last = await QuizVersion.findOne({ quizId })
        .sort({ version: -1 })
        .select('version contentHash')
        .lean();
      if (isSameQuizContent(checked.content, last?.contentHash) && quiz.status === 'published') {
        throw new AppError('CONFLICT', 'No hay cambios desde la última versión publicada');
      }
      // `last` puede ir por delante de `currentVersion` si una publicación se cortó entre crear la versión y marcar el
      // quiz: se salta ese número en vez de chocar con él para siempre.
      const version = Math.max(quiz.currentVersion, last?.version ?? 0) + 1;
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
        if (isDuplicateKey(error)) throw busy();
        throw error;
      }
      const moved = await Quiz.updateOne(
        { _id: quizId, publishLockUntil: lockUntil },
        {
          $set: { status: 'published', currentVersion: version, lastPublishedAt: publishedAt },
          $unset: { publishLockUntil: 1 },
        },
      );
      // Solo pasa si la reserva caducó (una publicación de más de `PUBLISH_LOCK_MS`) y otra la tomó.
      if (moved.matchedCount === 0) throw busy();

      return {
        quizId,
        version,
        publishedAt: publishedAt.toISOString(),
        warnings: checked.warnings,
      };
    } finally {
      // Si algo falló después de reservar, se suelta la reserva (si el quiz ya se marcó, no queda nada que soltar).
      await Quiz.updateOne(
        { _id: quizId, publishLockUntil: lockUntil },
        { $unset: { publishLockUntil: 1 } },
      );
    }
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
