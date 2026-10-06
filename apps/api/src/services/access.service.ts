import type {
  AccessTokenResponse,
  CreateAccessTokenRequest,
  RedeemAccessResponse,
  ResolveAccessResponse,
} from '@libro/shared';
import { Types } from 'mongoose';
import { buildAccessToken, hashAccessToken, parseAccessToken } from '../lib/accessToken.js';
import type { Clock } from '../lib/clock.js';
import { AppError } from '../lib/errors.js';
import { isDuplicateKey } from '../lib/mongoErrors.js';
import { qrPdf, qrSvg } from '../lib/qr.js';
import { AccessToken } from '../models/AccessToken.js';
import { Book } from '../models/Book.js';
import { Quiz } from '../models/Quiz.js';
import type { Actor, ProgressService } from './progress.service.js';

export interface AccessDeps {
  /** `ACCESS_TOKEN_SECRET`: firma los tokens. Respaldarlo; si se pierde, los QR impresos dejan de servir. */
  secret: string;
  /** URL pública del sitio: el QR apunta a `<appUrl>/u/<token>`. */
  appUrl: string;
  clock: Clock;
  progress: ProgressService;
}

type TokenLean = NonNullable<Awaited<ReturnType<typeof findLean>>>;

/** El destino siempre existe (es obligatorio en el esquema); esto solo le da forma no nula al tipo. */
function targetOf(token: { target?: { kind: 'quiz' | 'game'; refId: Types.ObjectId } | null }) {
  if (!token.target) throw new AppError('INTERNAL', 'El código no tiene destino');
  return token.target;
}

async function findLean(id: string) {
  return AccessToken.findById(id).lean();
}

function toResponse(token: TokenLean): AccessTokenResponse {
  return {
    id: token._id.toString(),
    bookId: token.bookId.toString(),
    target: { kind: targetOf(token).kind, refId: targetOf(token).refId.toString() },
    label: token.label,
    status: token.status,
    redeemCount: token.redeemCount,
    ...(token.lastRedeemedAt ? { lastRedeemedAt: token.lastRedeemedAt.toISOString() } : {}),
    ...(token.revokedAt ? { revokedAt: token.revokedAt.toISOString() } : {}),
    ...(token.revokedReason ? { revokedReason: token.revokedReason } : {}),
    ...(token.replacedBy ? { replacedBy: token.replacedBy.toString() } : {}),
    createdAt: token.createdAt.toISOString(),
  };
}

/**
 * QR de desbloqueo. Un QR activo por quiz, igual en todos los ejemplares, sin caducidad y
 * revocable. El token es `id + HMAC`; en la BD solo está su hash. Un código inválido, revocado o de algo despublicado
 * se comporta SIEMPRE igual (`null` → mensaje genérico), para no revelar qué existe.
 */
export function createAccessService(deps: AccessDeps) {
  const { secret, appUrl, clock, progress } = deps;

  async function mustFind(id: string): Promise<TokenLean> {
    const token = await findLean(id);
    if (!token) throw new AppError('NOT_FOUND', 'No encontramos ese código');
    return token;
  }

  /** Crea el documento con su token (el id se genera antes para poder firmarlo). */
  async function insert(
    target: { kind: 'quiz'; refId: string },
    bookId: Types.ObjectId,
    label: string,
    actor: Actor,
  ) {
    const id = new Types.ObjectId();
    const token = buildAccessToken(id.toString(), secret);
    try {
      await AccessToken.create({
        _id: id,
        bookId,
        target,
        tokenHash: hashAccessToken(token),
        label,
        createdBy: actor.userId,
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(
          'CONFLICT',
          'Ya hay un código activo para este quiz. Revócalo o rótalo.',
        );
      }
      throw error;
    }
    return id;
  }

  async function labelFor(quizId: string) {
    const quiz = await Quiz.findById(quizId).select('bookId order title').lean();
    if (!quiz) throw new AppError('NOT_FOUND', 'No encontramos ese quiz');
    const book = await Book.findById(quiz.bookId).select('title').lean();
    return { quiz, label: `${book?.title ?? 'Libro'} — Quiz ${quiz.order}: ${quiz.title}` };
  }

  async function create(
    actor: Actor,
    request: CreateAccessTokenRequest,
  ): Promise<AccessTokenResponse> {
    if (request.kind === 'game') {
      throw new AppError(
        'VALIDATION',
        'El código del juego se crea cuando exista el juego (fase 10)',
      );
    }
    const { quiz, label } = await labelFor(request.refId);
    const id = await insert({ kind: 'quiz', refId: request.refId }, quiz.bookId, label, actor);
    return toResponse(await mustFind(id.toString()));
  }

  async function list(bookId?: string): Promise<AccessTokenResponse[]> {
    const tokens = await AccessToken.find(bookId ? { bookId } : {})
      .sort({ createdAt: -1 })
      .lean();
    return tokens.map(toResponse);
  }

  /** Revoca: impide nuevos canjes (los desbloqueos ya concedidos se conservan). */
  async function revoke(actor: Actor, id: string, reason?: string): Promise<AccessTokenResponse> {
    const revoked = await AccessToken.findOneAndUpdate(
      { _id: id, status: 'active' },
      {
        $set: {
          status: 'revoked',
          revokedAt: clock(),
          revokedBy: actor.userId,
          ...(reason ? { revokedReason: reason } : {}),
        },
      },
      { returnDocument: 'after' },
    ).lean();
    if (revoked) return toResponse(revoked);
    await mustFind(id); // 404 si no existe
    throw new AppError('CONFLICT', 'Ese código ya está revocado');
  }

  /** Rotar = revocar el actual y crear otro (el QR impreso viejo deja de servir). */
  async function rotate(actor: Actor, id: string): Promise<AccessTokenResponse> {
    const current = await mustFind(id);
    if (current.status !== 'active')
      throw new AppError('CONFLICT', 'Solo se puede rotar un código activo');
    await revoke(actor, id, 'Rotado');
    let newId: Types.ObjectId;
    try {
      newId = await insert(
        { kind: 'quiz', refId: targetOf(current).refId.toString() },
        current.bookId,
        current.label,
        actor,
      );
    } catch (error) {
      // Si no se pudo crear el nuevo, se deja el anterior como estaba.
      await AccessToken.updateOne(
        { _id: id },
        { $set: { status: 'active' }, $unset: { revokedAt: 1, revokedBy: 1, revokedReason: 1 } },
      );
      throw error;
    }
    await AccessToken.updateOne({ _id: id }, { $set: { replacedBy: newId } });
    return toResponse(await mustFind(newId.toString()));
  }

  /** URL que codifica el QR: regenera el mismo token a partir del id (nunca se guarda en claro). */
  async function qrUrl(id: string) {
    const token = await mustFind(id);
    if (token.status !== 'active') {
      throw new AppError('CONFLICT', 'Este código está revocado: no se puede descargar');
    }
    return { token, url: `${appUrl}/u/${buildAccessToken(id, secret)}` };
  }

  async function downloadSvg(id: string): Promise<{ body: string; filename: string }> {
    const { token, url } = await qrUrl(id);
    return { body: await qrSvg(url), filename: `qr-${targetOf(token).refId.toString()}.svg` };
  }

  async function downloadPdf(id: string): Promise<{ body: Buffer; filename: string }> {
    const { token, url } = await qrUrl(id);
    return {
      body: qrPdf(url, {
        title: token.label,
        subtitle: 'Escanea el código con la cámara de tu celular',
      }),
      filename: `qr-${targetOf(token).refId.toString()}.pdf`,
    };
  }

  /**
   * Busca el código activo del token y su experiencia publicada. `null` para CUALQUIER problema (token mal formado,
   * firma alterada, inexistente, revocado, quiz o libro sin publicar): mismo resultado, sin pistas.
   */
  async function lookup(token: string) {
    const id = parseAccessToken(token, secret);
    if (!id) return null;
    const doc = await AccessToken.findOne({
      _id: id,
      tokenHash: hashAccessToken(token),
      status: 'active',
    }).lean();
    if (!doc || targetOf(doc).kind !== 'quiz') return null;
    const quiz = await Quiz.findById(targetOf(doc).refId)
      .select('bookId title status currentVersion')
      .lean();
    if (!quiz || quiz.status !== 'published' || quiz.currentVersion < 1) return null;
    const book = await Book.findById(quiz.bookId).select('title status').lean();
    if (book?.status !== 'published') return null;
    return { doc, quiz, book };
  }

  /** Metadatos mínimos para mostrar «vas a desbloquear X» antes de iniciar sesión. */
  async function resolve(token: string): Promise<ResolveAccessResponse | null> {
    const found = await lookup(token);
    if (!found) return null;
    return {
      valid: true,
      bookTitle: found.book.title,
      kind: targetOf(found.doc).kind,
      title: found.quiz.title,
    };
  }

  /** Canje idempotente: desbloquea la experiencia en la cuenta (ligado a la persona, no al dispositivo). */
  async function redeem(userId: string, token: string): Promise<RedeemAccessResponse | null> {
    const found = await lookup(token);
    if (!found) return null;
    const now = clock();
    const first = await progress.unlock({
      userId,
      bookId: found.quiz.bookId.toString(),
      kind: targetOf(found.doc).kind,
      refId: found.quiz._id.toString(),
      accessTokenId: found.doc._id.toString(),
      at: now,
    });
    await AccessToken.updateOne(
      { _id: found.doc._id },
      { $set: { lastRedeemedAt: now }, ...(first ? { $inc: { redeemCount: 1 } } : {}) },
    );
    return {
      kind: targetOf(found.doc).kind,
      refId: found.quiz._id.toString(),
      bookId: found.quiz.bookId.toString(),
      title: found.quiz.title,
      alreadyUnlocked: !first,
    };
  }

  return { create, list, revoke, rotate, downloadSvg, downloadPdf, resolve, redeem };
}

export type AccessService = ReturnType<typeof createAccessService>;
