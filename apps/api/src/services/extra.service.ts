import {
  EXTRA_FILE_RULES,
  type ExtraInput,
  type ExtraPreviewResponse,
  type ExtraResponse,
  type ExtraUploadUrlRequest,
  type ExtraUploadUrlResponse,
  type ReaderExtraResponse,
  type ReaderExtrasResponse,
} from '@libro/shared';
import type { Clock } from '../lib/clock.js';
import { randomToken } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { duplicateKeyFields, isDuplicateKey } from '../lib/mongoErrors.js';
import { sanitizeRichHtml } from '../lib/sanitize.js';
import { Book } from '../models/Book.js';
import { Extra } from '../models/Extra.js';
import { ExtraAccess } from '../models/ExtraAccess.js';
import type { StorageProvider } from '../providers/storage/StorageProvider.js';
import type { ProgressService } from './progress.service.js';

type ExtraLean = NonNullable<Awaited<ReturnType<typeof findLean>>>;

async function findLean(id: string) {
  return Extra.findById(id).lean();
}

/** Vida de la URL firmada que recibe el lector (minutos, no horas). */
export const READER_URL_TTL_SECONDS = 180;
/** La autora ve la vista previa con más calma. */
const PREVIEW_URL_TTL_SECONDS = 300;

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function toResponse(extra: ExtraLean): ExtraResponse {
  const file = extra.file;
  return {
    id: extra._id.toString(),
    bookId: extra.bookId.toString(),
    slug: extra.slug,
    title: extra.title,
    ...(extra.description ? { description: extra.description } : {}),
    kind: extra.kind,
    ...(file?.storageKey && file.mime && file.size && file.originalName
      ? {
          file: {
            storageKey: file.storageKey,
            mime: file.mime,
            size: file.size,
            originalName: file.originalName,
          },
        }
      : {}),
    ...(extra.bodyHtml ? { bodyHtml: extra.bodyHtml } : {}),
    order: extra.order,
    status: extra.status,
    ...(extra.publishedAt ? { publishedAt: extra.publishedAt.toISOString() } : {}),
    createdAt: extra.createdAt.toISOString(),
    updatedAt: extra.updatedAt.toISOString(),
  };
}

export interface ExtraDeps {
  storage: StorageProvider;
  progress: ProgressService;
  clock: Clock;
}

/**
 * Capítulos y documentos extra. Los de lectura SOLO se entregan a quien completó el libro (el servidor lo comprueba en
 * cada petición); los archivos viven en almacenamiento privado y salen con URL firmada de pocos minutos.
 */
export function createExtraService(deps: ExtraDeps) {
  const { storage, progress, clock } = deps;

  async function mustFind(id: string): Promise<ExtraLean> {
    const extra = await findLean(id);
    if (!extra) throw new AppError('NOT_FOUND', 'No encontramos ese extra');
    return extra;
  }

  // ----- Panel -----

  /** Permiso para subir el archivo directo al almacenamiento privado (el servidor nunca recibe los bytes). */
  async function createUploadUrl(request: ExtraUploadUrlRequest): Promise<ExtraUploadUrlResponse> {
    const rules = EXTRA_FILE_RULES[request.kind];
    if (!(rules.mimes as readonly string[]).includes(request.mime)) {
      throw new AppError('VALIDATION', 'Ese tipo de archivo no está permitido');
    }
    if (request.size > rules.maxBytes) {
      throw new AppError(
        'VALIDATION',
        `El archivo pesa demasiado (máximo ${Math.round(rules.maxBytes / 1024 / 1024)} MB)`,
      );
    }
    if (!(await Book.exists({ _id: request.bookId })))
      throw new AppError('NOT_FOUND', 'No encontramos ese libro');
    const storageKey = `extras/${request.bookId}/${randomToken(12)}.${EXTENSIONS[request.mime] ?? 'bin'}`;
    const target = await storage.createUploadUrl(storageKey, request.mime);
    return {
      storageKey,
      uploadUrl: target.url,
      headers: target.headers,
      maxBytes: rules.maxBytes,
      expiresIn: target.expiresIn,
    };
  }

  /** El archivo guardado debe estar de verdad en el almacenamiento, ser de este libro y cumplir tipo y tamaño. */
  async function assertFile(input: ExtraInput) {
    if (input.kind === 'text') return;
    const file = input.file;
    if (!file) throw new AppError('VALIDATION', 'Sube el archivo');
    const rules = EXTRA_FILE_RULES[input.kind];
    if (!file.storageKey.startsWith(`extras/${input.bookId}/`)) {
      throw new AppError('VALIDATION', 'El archivo no pertenece a este libro');
    }
    const stored = await storage.head(file.storageKey);
    if (!stored) throw new AppError('VALIDATION', 'El archivo todavía no se subió');
    const mime = stored.mime.split(';')[0]?.trim() ?? '';
    const allowed = rules.mimes as readonly string[];
    if (!allowed.includes(mime) || mime !== file.mime || stored.size > rules.maxBytes) {
      await storage.remove(file.storageKey).catch(() => undefined);
      throw new AppError('VALIDATION', 'El archivo no cumple el tipo o el tamaño permitidos');
    }
  }

  function conflict(error: unknown): never {
    if (isDuplicateKey(error) && duplicateKeyFields(error).includes('slug')) {
      throw new AppError('CONFLICT', 'Ya existe un extra con ese slug en este libro');
    }
    throw error;
  }

  async function list(bookId: string): Promise<ExtraResponse[]> {
    const extras = await Extra.find({ bookId }).sort({ order: 1, createdAt: 1 }).lean();
    return extras.map(toResponse);
  }

  async function get(id: string): Promise<ExtraResponse> {
    return toResponse(await mustFind(id));
  }

  async function create(input: ExtraInput): Promise<ExtraResponse> {
    if (!(await Book.exists({ _id: input.bookId })))
      throw new AppError('NOT_FOUND', 'No encontramos ese libro');
    await assertFile(input);
    try {
      const extra = await Extra.create({
        bookId: input.bookId,
        slug: input.slug,
        title: input.title,
        description: input.description,
        kind: input.kind,
        file: input.kind === 'text' ? undefined : input.file,
        bodyHtml: input.kind === 'text' ? sanitizeRichHtml(input.bodyHtml ?? '') : undefined,
        order: input.order,
        status: input.status,
        publishedAt: input.status === 'published' ? clock() : undefined,
      });
      return get(extra._id.toString());
    } catch (error) {
      return conflict(error);
    }
  }

  /** Reemplaza el extra (incluido el archivo: el anterior se borra del almacenamiento). El tipo no cambia. */
  async function replace(id: string, input: ExtraInput): Promise<ExtraResponse> {
    const current = await mustFind(id);
    if (current.bookId.toString() !== input.bookId) {
      throw new AppError('VALIDATION', 'Un extra no se puede mover a otro libro');
    }
    if (current.kind !== input.kind)
      throw new AppError('VALIDATION', 'No se puede cambiar el tipo de un extra');
    const newKey = input.file?.storageKey;
    if (newKey !== current.file?.storageKey) await assertFile(input);

    const body = input.kind === 'text' ? sanitizeRichHtml(input.bodyHtml ?? '') : undefined;
    const publishedAt =
      input.status === 'published' ? (current.publishedAt ?? clock()) : current.publishedAt;
    try {
      await Extra.updateOne(
        { _id: id },
        {
          $set: {
            slug: input.slug,
            title: input.title,
            order: input.order,
            status: input.status,
            ...(input.description ? { description: input.description } : {}),
            ...(input.kind === 'text' ? { bodyHtml: body } : { file: input.file }),
            ...(publishedAt ? { publishedAt } : {}),
          },
          $unset: {
            ...(input.description ? {} : { description: 1 }),
            ...(input.kind === 'text' ? { file: 1 } : { bodyHtml: 1 }),
          },
        },
      );
    } catch (error) {
      return conflict(error);
    }
    const oldKey = current.file?.storageKey;
    if (oldKey && oldKey !== newKey) await storage.remove(oldKey).catch(() => undefined);
    return get(id);
  }

  /** Vista previa de la autora: no exige haber completado el libro ni registra «visto». */
  async function preview(id: string): Promise<ExtraPreviewResponse> {
    const extra = await mustFind(id);
    if (extra.kind === 'text')
      return { kind: 'text', title: extra.title, bodyHtml: extra.bodyHtml ?? '' };
    if (!extra.file?.storageKey) throw new AppError('CONFLICT', 'Este extra no tiene archivo');
    return {
      kind: extra.kind,
      title: extra.title,
      url: await storage.createDownloadUrl(extra.file.storageKey, PREVIEW_URL_TTL_SECONDS),
      ...(extra.file.mime ? { mime: extra.file.mime } : {}),
      expiresIn: PREVIEW_URL_TTL_SECONDS,
    };
  }

  // ----- Lector -----

  /** Bloqueado → solo `{ locked: true }` (ni títulos ni cantidad). Completo → la lista de publicados. */
  async function listForReader(userId: string, bookId: string): Promise<ReaderExtrasResponse> {
    const book = await Book.findById(bookId).select('status').lean();
    if (book?.status !== 'published') throw new AppError('NOT_FOUND', 'No encontramos ese libro');
    if (!(await progress.isBookCompleted(userId, bookId))) return { locked: true };
    const [extras, seen] = await Promise.all([
      Extra.find({ bookId, status: 'published' }).sort({ order: 1 }).lean(),
      ExtraAccess.find({ userId, bookId }).select('extraId').lean(),
    ]);
    const opened = new Set(seen.map((access) => access.extraId.toString()));
    return {
      locked: false,
      extras: extras.map((extra) => ({
        id: extra._id.toString(),
        title: extra.title,
        ...(extra.description ? { description: extra.description } : {}),
        kind: extra.kind,
        order: extra.order,
        opened: opened.has(extra._id.toString()),
      })),
    };
  }

  /**
   * Entrega el extra. Se comprueba CADA vez que la persona completó el libro (403 sin contenido si no); recién entonces
   * se registra «visto» y se devuelve el texto o una URL firmada de vida corta.
   */
  async function open(userId: string, extraId: string): Promise<ReaderExtraResponse> {
    const extra = await findLean(extraId);
    if (!extra || extra.status !== 'published')
      throw new AppError('NOT_FOUND', 'No encontramos ese extra');
    await progress.assertBookCompleted(userId, extra.bookId.toString());

    const now = clock();
    try {
      await ExtraAccess.updateOne(
        { userId, extraId: extra._id },
        {
          $set: { lastSeenAt: now, bookId: extra.bookId },
          $inc: { viewCount: 1 },
          $setOnInsert: { firstSeenAt: now },
        },
        { upsert: true },
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      await ExtraAccess.updateOne(
        { userId, extraId: extra._id },
        { $set: { lastSeenAt: now }, $inc: { viewCount: 1 } },
      );
    }

    if (extra.kind === 'text')
      return { kind: 'text', title: extra.title, bodyHtml: extra.bodyHtml ?? '' };
    const key = extra.file?.storageKey;
    if (!key) throw new AppError('INTERNAL', 'Este extra no tiene archivo');
    return {
      kind: extra.kind,
      title: extra.title,
      url: await storage.createDownloadUrl(key, READER_URL_TTL_SECONDS),
      mime: extra.file?.mime ?? 'application/octet-stream',
      expiresIn: READER_URL_TTL_SECONDS,
    };
  }

  return { createUploadUrl, list, get, create, replace, preview, listForReader, open };
}

export type ExtraService = ReturnType<typeof createExtraService>;
