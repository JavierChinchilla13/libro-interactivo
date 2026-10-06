import type {
  ImageRef,
  UnlockRule,
  WikiEntryInput,
  WikiEntryResponse,
  WikiReorderRequest,
} from '@libro/shared';
import type { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { assertCloudinaryUrls } from '../lib/images.js';
import { duplicateKeyFields, isDuplicateKey } from '../lib/mongoErrors.js';
import { sanitizeRichHtml } from '../lib/sanitize.js';
import { escapeRegex, letterOf, normalizeName } from '../lib/text.js';
import { Book } from '../models/Book.js';
import { Quiz } from '../models/Quiz.js';
import { WikiEntry } from '../models/WikiEntry.js';

type EntryLean = NonNullable<Awaited<ReturnType<typeof loadLean>>>;

async function loadLean(id: string) {
  return WikiEntry.findById(id).lean();
}

function toResponse(entry: EntryLean): WikiEntryResponse {
  return {
    id: entry._id.toString(),
    ...(entry.bookId ? { bookId: entry.bookId.toString() } : {}),
    kind: entry.kind,
    slug: entry.slug,
    name: entry.name,
    letter: entry.letter,
    ...(entry.summary ? { summary: entry.summary } : {}),
    ...(entry.bodyHtml ? { bodyHtml: entry.bodyHtml } : {}),
    ...(entry.image ? { image: entry.image as ImageRef } : {}),
    ...(entry.group ? { group: entry.group } : {}),
    fields: (entry.fields ?? []).map((field) => ({
      label: field.label ?? '',
      value: field.value ?? '',
    })),
    ...(entry.parentId ? { parentId: entry.parentId.toString() } : {}),
    links: (entry.links ?? []).map((id) => id.toString()),
    ...(entry.unlockAfter ? { unlockAfter: entry.unlockAfter as UnlockRule } : {}),
    lockedDisplay: entry.lockedDisplay,
    order: entry.order,
    status: entry.status,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export interface WikiListFilter {
  kind?: string | undefined;
  bookId?: string | undefined;
  status?: string | undefined;
  parentId?: string | undefined;
  q?: string | undefined;
  letter?: string | undefined;
}

/**
 * Wiki unificada (panel): personajes, campos y poderes, lugares y glosario con un solo CRUD.
 * Se archiva en lugar de borrar. El bloqueo por progreso se aplica al servir al lector (fase 9).
 */
export function createWikiService() {
  function conflict(error: unknown): never {
    if (isDuplicateKey(error) && duplicateKeyFields(error).includes('slug')) {
      throw new AppError('CONFLICT', 'Ya existe una entrada con ese slug en este tipo y libro');
    }
    throw error;
  }

  /** Reglas de integridad de la wiki. */
  async function assertIntegrity(input: WikiEntryInput, selfId?: string) {
    if (input.bookId && !(await Book.exists({ _id: input.bookId }))) {
      throw new AppError('NOT_FOUND', 'No encontramos ese libro');
    }
    if (input.kind === 'power') {
      if (!input.parentId)
        throw new AppError('VALIDATION', 'Un poder debe pertenecer a un campo de poder');
    } else if (input.parentId) {
      throw new AppError('VALIDATION', 'Solo un poder puede pertenecer a un campo');
    }
    if (input.parentId) {
      if (input.parentId === selfId)
        throw new AppError('VALIDATION', 'Una entrada no puede ser su propio campo');
      const parent = await WikiEntry.findById(input.parentId).select('kind').lean();
      if (parent?.kind !== 'power_field') {
        throw new AppError('VALIDATION', 'El campo del poder no existe o no es un campo de poder');
      }
    }
    if (input.links.length > 0) {
      const unique = [...new Set(input.links)];
      if (selfId && unique.includes(selfId)) {
        throw new AppError('VALIDATION', 'Una entrada no puede enlazarse a sí misma');
      }
      if ((await WikiEntry.countDocuments({ _id: { $in: unique } })) !== unique.length) {
        throw new AppError('VALIDATION', 'Hay enlaces a entradas que no existen');
      }
    }
    const rule = input.unlockAfter;
    if (rule?.kind === 'quiz') {
      const scope = input.bookId ? { bookId: input.bookId } : {};
      if (!(await Quiz.exists({ _id: rule.refId, ...scope }))) {
        throw new AppError('VALIDATION', 'El bloqueo debe apuntar a un quiz existente del libro');
      }
    }
    assertCloudinaryUrls([input.image?.url]);
  }

  function toDocument(input: WikiEntryInput) {
    return {
      bookId: input.bookId,
      kind: input.kind,
      slug: input.slug,
      name: input.name,
      nameNormalized: normalizeName(input.name),
      letter: letterOf(input.name),
      summary: input.summary,
      bodyHtml: input.bodyHtml === undefined ? undefined : sanitizeRichHtml(input.bodyHtml),
      image: input.image,
      group: input.group,
      fields: input.fields,
      parentId: input.parentId,
      links: [...new Set(input.links)],
      unlockAfter: input.unlockAfter,
      lockedDisplay: input.lockedDisplay,
      order: input.order,
      status: input.status,
    };
  }

  async function list(filter: WikiListFilter): Promise<WikiEntryResponse[]> {
    const query: Record<string, unknown> = {};
    if (filter.kind) query['kind'] = filter.kind;
    if (filter.bookId) query['bookId'] = filter.bookId;
    if (filter.status) query['status'] = filter.status;
    if (filter.parentId) query['parentId'] = filter.parentId;
    if (filter.letter) query['letter'] = filter.letter;
    if (filter.q) query['nameNormalized'] = { $regex: escapeRegex(normalizeName(filter.q)) };
    const entries = await WikiEntry.find(query).sort({ order: 1, nameNormalized: 1 }).lean();
    return entries.map(toResponse);
  }

  async function get(id: string): Promise<WikiEntryResponse> {
    const entry = await loadLean(id);
    if (!entry) throw new AppError('NOT_FOUND', 'No encontramos esa entrada');
    return toResponse(entry);
  }

  async function create(input: WikiEntryInput): Promise<WikiEntryResponse> {
    await assertIntegrity(input);
    try {
      const entry = await WikiEntry.create(toDocument(input));
      return get(entry._id.toString());
    } catch (error) {
      return conflict(error);
    }
  }

  /** Reemplaza la entrada completa. El tipo no se puede cambiar (un poder no «se vuelve» lugar). */
  async function replace(id: string, input: WikiEntryInput): Promise<WikiEntryResponse> {
    const current = await loadLean(id);
    if (!current) throw new AppError('NOT_FOUND', 'No encontramos esa entrada');
    if (current.kind !== input.kind)
      throw new AppError('VALIDATION', 'No se puede cambiar el tipo de una entrada');
    await assertIntegrity(input, id);
    const data = toDocument(input);
    const unset = Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => value === undefined)
        .map(([key]) => [key, 1]),
    );
    const set = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    try {
      await WikiEntry.updateOne(
        { _id: id },
        { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      );
    } catch (error) {
      return conflict(error);
    }
    return get(id);
  }

  /** Numera 1..n las entradas en el orden recibido. Todas deben ser del mismo tipo (y libro). */
  async function reorder(request: WikiReorderRequest): Promise<WikiEntryResponse[]> {
    const ids = [...new Set(request.ids)];
    if (ids.length !== request.ids.length)
      throw new AppError('VALIDATION', 'Hay entradas repetidas');
    const found = await WikiEntry.find({ _id: { $in: ids } })
      .select('kind bookId')
      .lean();
    const sameScope = (bookId: Types.ObjectId | null | undefined) =>
      (bookId?.toString() ?? undefined) === request.bookId;
    if (
      found.length !== ids.length ||
      found.some((e) => e.kind !== request.kind || !sameScope(e.bookId))
    ) {
      throw new AppError('VALIDATION', 'Las entradas deben existir y ser del mismo tipo y libro');
    }
    await WikiEntry.bulkWrite(
      ids.map((id, index) => ({
        updateOne: { filter: { _id: id }, update: { $set: { order: index + 1 } } },
      })),
    );
    return list({ kind: request.kind, ...(request.bookId ? { bookId: request.bookId } : {}) });
  }

  return { list, get, create, replace, reorder };
}

export type WikiService = ReturnType<typeof createWikiService>;
