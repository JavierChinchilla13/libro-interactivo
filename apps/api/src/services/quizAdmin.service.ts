import {
  quizAppearanceSchema,
  quizContentSchema,
  quizDraftSchema,
  type CreateQuizRequest,
  type QuizDetailResponse,
  type QuizDraft,
  type QuizSummary,
  type QuizVersionsResponse,
  type UpdateQuizMetaRequest,
} from '@libro/shared';
import type { Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import { duplicateKeyFields, isDuplicateKey } from '../lib/mongoErrors.js';
import { Book } from '../models/Book.js';
import { Quiz } from '../models/Quiz.js';
import { QuizAttempt } from '../models/QuizAttempt.js';
import { QuizVersion } from '../models/QuizVersion.js';
import type { Actor } from './progress.service.js';
import { assertQuizMediaAllowed, sanitizeQuizHtml } from './quizContent.js';
import { draftContentOf, isSameQuizContent } from './quizPublish.service.js';

type QuizLean = NonNullable<Awaited<ReturnType<typeof loadLean>>>;

async function loadLean(id: string) {
  return Quiz.findById(id).lean();
}

/** ¿El borrador difiere de la última versión publicada? Se compara el hash del contenido completo y saneado. */
function differsFromPublished(quiz: QuizLean, latestHash: string | undefined): boolean {
  if (latestHash === undefined) return true;
  const strict = quizContentSchema.safeParse(draftContentOf(quiz));
  return !strict.success || !isSameQuizContent(sanitizeQuizHtml(strict.data), latestHash);
}

function toSummary(quiz: QuizLean, hasUnpublishedChanges: boolean): QuizSummary {
  const settings = (quiz.settings ?? {}) as { allowRetake?: boolean; showBreakdown?: boolean };
  return {
    id: quiz._id.toString(),
    bookId: quiz.bookId.toString(),
    slug: quiz.slug,
    order: quiz.order,
    title: quiz.title,
    status: quiz.status,
    currentVersion: quiz.currentVersion,
    ...(quiz.lastPublishedAt ? { lastPublishedAt: quiz.lastPublishedAt.toISOString() } : {}),
    allowRetake: settings.allowRetake !== false,
    showBreakdown: settings.showBreakdown === true,
    updatedAt: quiz.updatedAt.toISOString(),
    hasUnpublishedChanges,
  };
}

export interface QuizAdminDeps {
  clock: Clock;
}

/**
 * Edición de quizzes (panel): crear, guardar el borrador, cambiar slug/orden, archivar y ver versiones.
 * Los quizzes no se borran (se archivan). Editar el borrador nunca toca lo ya publicado: las versiones son inmutables
 * y los intentos siguen apuntando a la suya.
 */
export function createQuizAdminService(deps: QuizAdminDeps) {
  async function mustFind(id: string): Promise<QuizLean> {
    const quiz = await loadLean(id);
    if (!quiz) throw new AppError('NOT_FOUND', 'No encontramos ese quiz');
    return quiz;
  }

  function conflict(error: unknown): never {
    if (isDuplicateKey(error)) {
      const fields = duplicateKeyFields(error);
      if (fields.includes('slug'))
        throw new AppError('CONFLICT', 'Ya existe un quiz con ese slug en este libro');
      if (fields.includes('order')) {
        throw new AppError('CONFLICT', 'Ya hay otro quiz en esa posición de la secuencia');
      }
      throw new AppError('CONFLICT', 'Ya existe un quiz con esos datos');
    }
    throw error;
  }

  async function list(bookId: string, status?: 'draft' | 'published' | 'archived') {
    const quizzes = await Quiz.find({ bookId, ...(status ? { status } : {}) })
      .sort({ order: 1 })
      .lean();
    // Una sola consulta para las últimas versiones de todos (no una por quiz).
    const latest = quizzes.length
      ? await QuizVersion.find({
          $or: quizzes.map((quiz) => ({ quizId: quiz._id, version: quiz.currentVersion })),
        })
          .select('quizId contentHash')
          .lean()
      : [];
    const hashes = new Map(
      latest.map((version) => [version.quizId.toString(), version.contentHash]),
    );
    return quizzes.map((quiz) =>
      toSummary(quiz, differsFromPublished(quiz, hashes.get(quiz._id.toString()))),
    );
  }

  /** Ids de pregunta de un contenido de etapas (borrador o versión); tolera datos raros. */
  function questionIdsOf(stages: unknown): string[] {
    const ids: string[] = [];
    for (const stage of Array.isArray(stages) ? (stages as unknown[]) : []) {
      const questions = (stage as { questions?: unknown } | null)?.questions;
      for (const question of Array.isArray(questions) ? (questions as unknown[]) : []) {
        const id = (question as { id?: unknown } | null)?.id;
        if (typeof id === 'string') ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Ids que una pregunta NUEVA no puede usar (los de las versiones publicadas y los de la apariencia, aunque su
   * pregunta ya no esté en el borrador). Los del borrador actual también se incluyen: el editor no los reasigna.
   */
  async function reservedQuestionIds(quiz: QuizLean): Promise<string[]> {
    const versions = await QuizVersion.find({ quizId: quiz._id }).select('stages').lean();
    const appearanceQuestions = (quiz.appearance as { questions?: unknown } | null | undefined)
      ?.questions;
    const fromAppearance =
      appearanceQuestions && typeof appearanceQuestions === 'object'
        ? Object.keys(appearanceQuestions)
        : [];
    return [
      ...new Set([
        ...questionIdsOf(quiz.draft?.stages),
        ...versions.flatMap((version) => questionIdsOf(version.stages)),
        ...fromAppearance,
      ]),
    ];
  }

  async function detail(quiz: QuizLean): Promise<QuizDetailResponse> {
    const draft = quizDraftSchema.parse(draftContentOf(quiz));
    const latest = await QuizVersion.findOne({ quizId: quiz._id, version: quiz.currentVersion })
      .select('contentHash')
      .lean();
    const hasUnpublishedChanges = differsFromPublished(quiz, latest?.contentHash);
    const appearance = quizAppearanceSchema.safeParse(quiz.appearance);
    return {
      ...toSummary(quiz, hasUnpublishedChanges),
      draft,
      ...(appearance.success ? { appearance: appearance.data } : {}),
      appearanceRev: quiz.appearanceRev ?? 0,
      reservedQuestionIds: await reservedQuestionIds(quiz),
    };
  }

  async function get(id: string): Promise<QuizDetailResponse> {
    return detail(await mustFind(id));
  }

  /** Crea un quiz vacío en borrador. «¿Se puede repetir?» se elige aquí (y se puede cambiar al editar). */
  async function create(input: CreateQuizRequest, actor: Actor): Promise<QuizDetailResponse> {
    if (!(await Book.exists({ _id: input.bookId }))) {
      throw new AppError('NOT_FOUND', 'No encontramos ese libro');
    }
    try {
      const quiz = await Quiz.create({
        bookId: input.bookId,
        slug: input.slug,
        order: input.order,
        title: input.title,
        instructionsHtml: '',
        settings: input.settings,
        draft: { stages: [], results: [], updatedAt: deps.clock(), updatedBy: actor.userId },
      });
      return get(quiz._id.toString());
    } catch (error) {
      return conflict(error);
    }
  }

  /** Reemplaza el borrador completo (admite contenido incompleto; solo validar/publicar lo exigen). */
  async function saveDraft(
    id: string,
    draft: QuizDraft,
    actor: Actor,
  ): Promise<QuizDetailResponse> {
    const quiz = await mustFind(id);
    if (quiz.status === 'archived')
      throw new AppError('CONFLICT', 'Un quiz archivado no se puede editar');
    assertQuizMediaAllowed(draft);
    // Una pregunta NUEVA (que no estaba en el borrador guardado) no puede estrenar un id ya usado por una versión
    // publicada o por un ajuste de la apariencia: heredaría en silencio un ajuste huérfano. Lo garantiza el servidor
    // (regla 1); el editor ya los evita al numerar.
    const previous = new Set(questionIdsOf(quiz.draft?.stages));
    const reserved = new Set(await reservedQuestionIds(quiz));
    const reused = questionIdsOf(draft.stages).find((id) => !previous.has(id) && reserved.has(id));
    if (reused !== undefined) {
      throw new AppError(
        'VALIDATION',
        `El id «${reused}» ya lo usó una pregunta de este quiz (en una versión publicada o en la apariencia). Recarga el editor para que numere de nuevo.`,
      );
    }
    const clean = sanitizeQuizHtml(draft);
    // Con apariencia en vivo, la introducción y la portada se editan allí (sin versión): el borrador deja de tocar
    // esos dos campos de la raíz, que quedan como la copia que se congela en cada versión publicada.
    const liveAppearance = quiz.appearance !== undefined && quiz.appearance !== null;
    await Quiz.updateOne(
      { _id: id },
      {
        $set: {
          title: clean.title,
          settings: clean.settings,
          'draft.stages': clean.stages,
          'draft.results': clean.results,
          'draft.updatedAt': deps.clock(),
          'draft.updatedBy': actor.userId,
          ...(liveAppearance ? {} : { instructionsHtml: clean.instructionsHtml }),
          ...(!liveAppearance && clean.image ? { image: clean.image } : {}),
        },
        ...(!liveAppearance && !clean.image ? { $unset: { image: 1 } } : {}),
      },
    );
    return get(id);
  }

  async function updateMeta(id: string, patch: UpdateQuizMetaRequest): Promise<QuizDetailResponse> {
    const quiz = await mustFind(id);
    if (quiz.status === 'archived')
      throw new AppError('CONFLICT', 'Un quiz archivado no se puede editar');
    try {
      await Quiz.updateOne(
        { _id: id },
        {
          $set: {
            ...(patch.slug ? { slug: patch.slug } : {}),
            ...(patch.order ? { order: patch.order } : {}),
          },
        },
      );
    } catch (error) {
      return conflict(error);
    }
    return get(id);
  }

  /** Archiva (no borra): deja de aparecer a los lectores y libera su posición en la secuencia. */
  async function archive(id: string): Promise<QuizDetailResponse> {
    await mustFind(id);
    await Quiz.updateOne({ _id: id }, { $set: { status: 'archived' } });
    return get(id);
  }

  async function versions(id: string): Promise<QuizVersionsResponse> {
    const quiz = await mustFind(id);
    const [docs, counts] = await Promise.all([
      QuizVersion.find({ quizId: quiz._id }).sort({ version: -1 }).lean(),
      QuizAttempt.aggregate<{ _id: number; attempts: number }>([
        { $match: { quizId: quiz._id, isTest: false } },
        { $group: { _id: '$version', attempts: { $sum: 1 } } },
      ]),
    ]);
    const byVersion = new Map(counts.map((row) => [row._id, row.attempts]));
    return {
      versions: docs.map((version) => ({
        version: version.version,
        publishedAt: version.publishedAt.toISOString(),
        publishedBy: version.publishedBy.toString(),
        contentHash: version.contentHash,
        attempts: byVersion.get(version.version) ?? 0,
      })),
    };
  }

  return { list, get, create, saveDraft, updateMeta, archive, versions };
}

export type QuizAdminService = ReturnType<typeof createQuizAdminService>;
