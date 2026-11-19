import {
  EXTRA_FILE_RULES,
  EXTRA_HEADER_FORMATS,
  EXTRA_HEADER_MAX_WIDTH,
  EXTRA_HEADER_PUBLIC_ID_PATTERN,
  type ExtraHeaderForReader,
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
import { assertCloudinaryUrls, cloudNameOf, optimizedImageUrl } from '../lib/images.js';
import { duplicateKeyFields, isDuplicateKey } from '../lib/mongoErrors.js';
import { sanitizeRichHtml } from '../lib/sanitize.js';
import { Book } from '../models/Book.js';
import { Extra } from '../models/Extra.js';
import { ExtraAccess } from '../models/ExtraAccess.js';
import { NotificationJob } from '../models/NotificationJob.js';
import type { Logger } from '../lib/logger.js';
import {
  auditDeletion,
  blockedError,
  notArchivedError,
  notDeletableError,
  type Noun,
} from './lifecycle.js';
import type { ImageProvider } from '../providers/images/ImageProvider.js';
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

/** La imagen de encabezado guardada, solo si está completa (un extra sin imagen no tiene nada de esto). */
function storedHeader(extra: ExtraLean) {
  const header = extra.headerImage;
  if (!header?.publicId || !header.url || !header.width || !header.height || !header.alt)
    return undefined;
  return {
    publicId: header.publicId,
    url: header.url,
    width: header.width,
    height: header.height,
    alt: header.alt,
  };
}

/**
 * Lo que recibe la lectora (o la autora en la vista previa): la URL se ARMA al servir desde el identificador (con
 * `f_auto,q_auto` y el ancho acotado) y las medidas se ajustan a ese ancho para que la página no salte al cargar.
 * Solo se llama desde las respuestas que ya validaron sesión y libro completo, o desde la vista previa del panel.
 */
function headerForReader(extra: ExtraLean): ExtraHeaderForReader | undefined {
  const header = storedHeader(extra);
  if (!header) return undefined;
  const width = Math.min(header.width, EXTRA_HEADER_MAX_WIDTH);
  return {
    url: optimizedImageUrl(header.publicId, EXTRA_HEADER_MAX_WIDTH),
    width,
    height: Math.max(1, Math.round((header.height * width) / header.width)),
    alt: header.alt,
  };
}

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
    ...(storedHeader(extra)
      ? {
          headerImage: {
            provider: 'cloudinary' as const,
            deliveryType: 'upload' as const,
            ...storedHeader(extra)!,
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
  images: ImageProvider;
  progress: ProgressService;
  clock: Clock;
  logger?: Logger;
}

/**
 * Capítulos y documentos extra. Los de lectura SOLO se entregan a quien completó el libro (el servidor lo comprueba en
 * cada petición); los archivos viven en almacenamiento privado y salen con URL firmada de pocos minutos.
 */
export function createExtraService(deps: ExtraDeps) {
  const { storage, images, progress, clock } = deps;

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

  /**
   * La imagen de encabezado debe ser de NUESTRA cuenta de Cloudinary, estar en `libro/extra/`, existir de verdad (lo dice
   * Cloudinary) y ser JPG, PNG o WebP. Las medidas guardadas son las reales, no las del navegador; la URL se rearma desde el
   * identificador para que no apunte a otra cosa. Sin tope de peso (lo pone el plan de Cloudinary).
   */
  async function verifyHeader(
    header: NonNullable<ExtraInput['headerImage']>,
  ): Promise<{ publicId: string; url: string; width: number; height: number; alt: string }> {
    assertCloudinaryUrls([header.url]);
    if (!EXTRA_HEADER_PUBLIC_ID_PATTERN.test(header.publicId)) {
      throw new AppError(
        'VALIDATION',
        'La imagen del encabezado debe subirse con el panel (carpeta de capítulos extra)',
      );
    }
    const info = await images.inspect({ publicId: header.publicId, resource: 'image' });
    if (!info)
      throw new AppError('VALIDATION', 'No encontramos esa imagen en Cloudinary: súbela de nuevo');
    const format = info.format === 'jpeg' ? 'jpg' : info.format;
    if (!(EXTRA_HEADER_FORMATS as readonly string[]).includes(format)) {
      throw new AppError('VALIDATION', 'La imagen del encabezado debe ser JPG, PNG o WebP');
    }
    const cloud = cloudNameOf(header.url);
    return {
      publicId: header.publicId,
      url: `https://res.cloudinary.com/${cloud}/image/upload/${header.publicId}.${format}`,
      width: info.width,
      height: info.height,
      alt: header.alt.trim(),
    };
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
    const headerImage = input.headerImage ? await verifyHeader(input.headerImage) : undefined;
    try {
      const extra = await Extra.create({
        bookId: input.bookId,
        slug: input.slug,
        title: input.title,
        description: input.description,
        kind: input.kind,
        file: input.kind === 'text' ? undefined : input.file,
        headerImage,
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
    // Misma imagen que ya estaba: no se vuelve a consultar a Cloudinary (solo puede cambiar el texto alternativo).
    const kept = storedHeader(current);
    const headerImage = !input.headerImage
      ? undefined
      : kept && kept.publicId === input.headerImage.publicId
        ? { ...kept, alt: input.headerImage.alt.trim() }
        : await verifyHeader(input.headerImage);

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
            ...(headerImage ? { headerImage } : {}),
            ...(publishedAt ? { publishedAt } : {}),
          },
          $unset: {
            ...(input.description ? {} : { description: 1 }),
            ...(headerImage ? {} : { headerImage: 1 }),
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
    const headerImage = headerForReader(extra);
    if (extra.kind === 'text')
      return {
        kind: 'text',
        title: extra.title,
        bodyHtml: extra.bodyHtml ?? '',
        ...(headerImage ? { headerImage } : {}),
      };
    if (!extra.file?.storageKey) throw new AppError('CONFLICT', 'Este extra no tiene archivo');
    return {
      kind: extra.kind,
      title: extra.title,
      ...(headerImage ? { headerImage } : {}),
      url: await storage.createDownloadUrl(extra.file.storageKey, PREVIEW_URL_TTL_SECONDS),
      ...(extra.file.mime ? { mime: extra.file.mime } : {}),
      expiresIn: PREVIEW_URL_TTL_SECONDS,
    };
  }

  // ----- Lector -----

  /**
   * Bloqueado → solo `{ locked: true, hasExtras }` (un booleano: ni títulos ni cantidad). Completo → la lista de
   * publicados.
   */
  async function listForReader(userId: string, bookId: string): Promise<ReaderExtrasResponse> {
    const book = await Book.findById(bookId).select('status').lean();
    if (book?.status !== 'published') throw new AppError('NOT_FOUND', 'No encontramos ese libro');
    if (!(await progress.isBookCompleted(userId, bookId))) {
      return {
        locked: true,
        hasExtras: (await Extra.exists({ bookId, status: 'published' })) !== null,
      };
    }
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

    // La imagen de encabezado sale SOLO aquí (ya se comprobó sesión y libro completo), nunca en la lista.
    const bookIdText = extra.bookId.toString();
    const headerImage = headerForReader(extra);
    if (extra.kind === 'text')
      return {
        kind: 'text',
        bookId: bookIdText,
        title: extra.title,
        bodyHtml: extra.bodyHtml ?? '',
        ...(headerImage ? { headerImage } : {}),
      };
    const key = extra.file?.storageKey;
    if (!key) throw new AppError('INTERNAL', 'Este extra no tiene archivo');
    return {
      kind: extra.kind,
      bookId: bookIdText,
      title: extra.title,
      url: await storage.createDownloadUrl(key, READER_URL_TTL_SECONDS),
      mime: extra.file?.mime ?? 'application/octet-stream',
      expiresIn: READER_URL_TTL_SECONDS,
      ...(headerImage ? { headerImage } : {}),
    };
  }

  // --- Archivar, restaurar y eliminar (ver `lifecycle.ts`) -------------------------------------------------------

  const NOUN: Noun = { name: 'capítulo extra', feminine: false };

  /** Reversible: deja de verse para los lectores. */
  async function archive(id: string): Promise<ExtraResponse> {
    await mustFind(id);
    await Extra.updateOne({ _id: id }, { $set: { status: 'archived' } });
    return get(id);
  }

  /** Vuelve a borrador: nada reaparece para los lectores sin publicarse a propósito. */
  async function restore(id: string): Promise<ExtraResponse> {
    const extra = await mustFind(id);
    if (extra.status !== 'archived') throw notArchivedError(NOUN);
    await Extra.updateOne({ _id: id, status: 'archived' }, { $set: { status: 'draft' } });
    return get(id);
  }

  /**
   * Definitivo. Solo lo archivado o en borrador, y nunca si ya se avisó por correo ni si ya lo abrieron lectores (se
   * conserva ese registro). El archivo del extra se borra del almacenamiento privado, como ya ocurre cuando se reemplaza.
   */
  async function remove(id: string, actorId: string): Promise<void> {
    const extra = await mustFind(id);
    if (extra.status === 'published') throw notDeletableError(NOUN);
    if (await NotificationJob.exists({ kind: 'extra', refId: id })) {
      throw blockedError(
        'Este capítulo extra ya se avisó por correo: se conserva el registro de ese envío, así que no se puede eliminar. Déjalo archivado.',
      );
    }
    if (await ExtraAccess.exists({ extraId: id })) {
      throw blockedError(
        'Este capítulo extra ya lo abrieron lectores: se conserva su registro, así que no se puede eliminar. Déjalo archivado.',
      );
    }
    const result = await Extra.deleteOne({ _id: id, status: { $in: ['draft', 'archived'] } });
    if (result.deletedCount === 0) throw notDeletableError(NOUN);
    const key = extra.file?.storageKey;
    if (key) await storage.remove(key).catch(() => undefined);
    auditDeletion(deps.logger, { entity: 'extra', id, title: extra.title, actorId });
  }

  return {
    createUploadUrl,
    list,
    get,
    create,
    replace,
    preview,
    listForReader,
    open,
    archive,
    restore,
    remove,
  };
}

export type ExtraService = ReturnType<typeof createExtraService>;
