import {
  APPEARANCE_FIELDS,
  APPEARANCE_HISTORY_LIMIT,
  quizAppearanceSchema,
  type AppearanceField,
  type AppearanceHistoryEntry,
  type QuizAppearance,
  type QuizAppearanceResponse,
  type RevertQuizAppearanceRequest,
  type UpdateQuizAppearanceRequest,
} from '@libro/shared';
import type { Types } from 'mongoose';
import type { Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import { assertCloudinaryUrls } from '../lib/images.js';
import { sanitizeRichHtml } from '../lib/sanitize.js';
import { Quiz } from '../models/Quiz.js';
import { QuizVersion } from '../models/QuizVersion.js';
import { User } from '../models/User.js';
import type { Actor } from './progress.service.js';

export interface QuizAppearanceDeps {
  clock: Clock;
}

type HistoryDoc = {
  rev: number;
  at: Date;
  by: Types.ObjectId;
  action: 'update' | 'revert' | 'seed';
  changed: string[];
  before: unknown;
};

const ARCHIVED_MESSAGE = 'Un quiz archivado no se puede editar';
const STALE_MESSAGE = 'Otra persona cambió la apariencia de este quiz: recarga para ver su versión';

/** Texto plano de un fragmento de HTML (para buscar nombres de resultados). */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function stable(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

/** Claves de la lista blanca que difieren entre dos estados (`null` cuenta como «sin nada»). */
export function changedFields(
  before: QuizAppearance | null,
  after: QuizAppearance | null,
): AppearanceField[] {
  return APPEARANCE_FIELDS.filter((field) => stable(before?.[field]) !== stable(after?.[field]));
}

/** El valor guardado debe seguir cumpliendo el esquema: si no (dato viejo o dañado), se trata como «sin apariencia». */
function readStored(value: unknown): QuizAppearance | null {
  if (value === undefined || value === null) return null;
  const parsed = quizAppearanceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Apariencia en vivo de un quiz (regla 5, excepción acotada): se edita sin publicar una versión nueva porque solo
 * contiene decoración (fondo, velo, acento, portada y texto de introducción). Cada cambio es una sola operación atómica
 * con comprobación de revisión y deja una entrada de auditoría (quién, cuándo, qué claves y el estado anterior); se
 * conservan las últimas `APPEARANCE_HISTORY_LIMIT` y se pueden revertir. Nunca toca `quizVersions`.
 */
export function createQuizAppearanceService(deps: QuizAppearanceDeps) {
  async function mustFind(quizId: string) {
    const quiz = await Quiz.findById(quizId).lean();
    if (!quiz) throw new AppError('NOT_FOUND', 'No encontramos ese quiz');
    return quiz;
  }

  /** Nombres de quienes editaron (`null` si la cuenta ya no existe). */
  async function names(ids: Types.ObjectId[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await User.find({ _id: { $in: ids } })
      .select('name')
      .lean();
    return new Map(users.map((user) => [user._id.toString(), user.name]));
  }

  async function view(
    quiz: NonNullable<Awaited<ReturnType<typeof mustFind>>>,
    warnings: QuizAppearanceResponse['warnings'] = [],
  ): Promise<QuizAppearanceResponse> {
    const history = ((quiz.appearanceHistory ?? []) as HistoryDoc[])
      .slice()
      .sort((a, b) => b.rev - a.rev);
    const byName = await names([
      ...new Set(history.map((entry) => entry.by.toString())),
    ] as unknown as Types.ObjectId[]);
    return {
      appearance: readStored(quiz.appearance),
      rev: quiz.appearanceRev ?? 0,
      history: history.map((entry): AppearanceHistoryEntry => ({
        rev: entry.rev,
        at: entry.at.toISOString(),
        by: { id: entry.by.toString(), name: byName.get(entry.by.toString()) ?? null },
        action: entry.action,
        changed: entry.changed.filter((key): key is AppearanceField =>
          (APPEARANCE_FIELDS as readonly string[]).includes(key),
        ),
      })),
      warnings,
    };
  }

  /** Títulos y claves de resultado del quiz (borrador y última versión publicada) para detectar fugas por texto libre. */
  async function resultNames(
    quiz: NonNullable<Awaited<ReturnType<typeof mustFind>>>,
  ): Promise<string[]> {
    const names: string[] = [];
    const collect = (results: unknown) => {
      for (const result of (Array.isArray(results) ? results : []) as {
        key?: string;
        title?: string;
      }[]) {
        if (result.title) names.push(result.title);
        if (result.key) names.push(result.key);
      }
    };
    collect(quiz.draft?.results);
    if (quiz.currentVersion >= 1) {
      const version = await QuizVersion.findOne({ quizId: quiz._id, version: quiz.currentVersion })
        .select('results')
        .lean();
      collect(version?.results);
    }
    return [...new Set(names.map((name) => name.trim().toLowerCase()))].filter(
      (name) => name.length >= 4,
    );
  }

  function mentionsResult(appearance: QuizAppearance, known: string[]): boolean {
    const background = appearance.background;
    const alt =
      background?.kind === 'image'
        ? background.image.alt
        : background?.kind === 'video'
          ? background.video.alt
          : '';
    const text = `${alt} ${plainText(appearance.introHtml ?? '')}`.toLowerCase();
    return known.some((name) => text.includes(name));
  }

  /** Revisa el bloque (esquema estricto, URLs de Cloudinary, HTML saneado). Devuelve el bloque limpio. */
  function validated(raw: unknown): QuizAppearance {
    const parsed = quizAppearanceSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Apariencia no válida');
    }
    const appearance = parsed.data;
    const urls: (string | undefined)[] = [appearance.cover?.url];
    if (appearance.background?.kind === 'image') urls.push(appearance.background.image.url);
    if (appearance.background?.kind === 'video') {
      urls.push(appearance.background.video.url, appearance.background.video.posterUrl);
    }
    assertCloudinaryUrls(urls);
    return {
      ...appearance,
      ...(appearance.introHtml === undefined
        ? {}
        : { introHtml: sanitizeRichHtml(appearance.introHtml) }),
    };
  }

  /**
   * Escribe un estado nuevo en una sola operación: solo si la revisión sigue siendo la que la persona vio y el quiz no
   * está archivado. Sin coincidencia no cambia nada (409).
   */
  async function commit(
    quiz: NonNullable<Awaited<ReturnType<typeof mustFind>>>,
    actor: Actor,
    next: QuizAppearance | null,
    action: HistoryDoc['action'],
    expectedRev: number,
  ): Promise<void> {
    const before = readStored(quiz.appearance);
    const entry: HistoryDoc = {
      rev: expectedRev + 1,
      at: deps.clock(),
      by: actor.userId as unknown as Types.ObjectId,
      action,
      changed: changedFields(before, next),
      before,
    };
    const revFilter =
      expectedRev === 0
        ? { $or: [{ appearanceRev: 0 }, { appearanceRev: { $exists: false } }] }
        : { appearanceRev: expectedRev };
    const result = await Quiz.updateOne(
      { _id: quiz._id, status: { $ne: 'archived' }, ...revFilter },
      {
        ...(next === null ? { $unset: { appearance: 1 } } : { $set: { appearance: next } }),
        $inc: { appearanceRev: 1 },
        $push: { appearanceHistory: { $each: [entry], $slice: -APPEARANCE_HISTORY_LIMIT } },
      },
    );
    if (result.matchedCount === 0) {
      const now = await Quiz.findById(quiz._id).select('status').lean();
      throw new AppError('CONFLICT', now?.status === 'archived' ? ARCHIVED_MESSAGE : STALE_MESSAGE);
    }
  }

  async function get(quizId: string): Promise<QuizAppearanceResponse> {
    return view(await mustFind(quizId));
  }

  async function update(
    quizId: string,
    actor: Actor,
    request: UpdateQuizAppearanceRequest,
  ): Promise<QuizAppearanceResponse> {
    const quiz = await mustFind(quizId);
    if (quiz.status === 'archived') throw new AppError('CONFLICT', ARCHIVED_MESSAGE);
    const next = validated(request.appearance);
    const first = readStored(quiz.appearance) === null;
    await commit(quiz, actor, next, first ? 'seed' : 'update', request.expectedRev);
    const warnings: QuizAppearanceResponse['warnings'] = mentionsResult(
      next,
      await resultNames(quiz),
    )
      ? ['APPEARANCE_MENTIONS_RESULT']
      : [];
    return view(await mustFind(quizId), warnings);
  }

  async function revert(
    quizId: string,
    actor: Actor,
    request: RevertQuizAppearanceRequest,
  ): Promise<QuizAppearanceResponse> {
    const quiz = await mustFind(quizId);
    if (quiz.status === 'archived') throw new AppError('CONFLICT', ARCHIVED_MESSAGE);
    if ((quiz.appearanceRev ?? 0) !== request.expectedRev)
      throw new AppError('CONFLICT', STALE_MESSAGE);
    const entry = ((quiz.appearanceHistory ?? []) as HistoryDoc[]).find(
      (e) => e.rev === request.rev,
    );
    if (!entry) {
      throw new AppError(
        'NOT_FOUND',
        'Ese cambio ya no está en el historial (se guardan los últimos 10)',
      );
    }
    const restored = entry.before === null ? null : validated(entry.before);
    await commit(quiz, actor, restored, 'revert', request.expectedRev);
    return view(await mustFind(quizId));
  }

  return { get, update, revert };
}

export type QuizAppearanceService = ReturnType<typeof createQuizAppearanceService>;
