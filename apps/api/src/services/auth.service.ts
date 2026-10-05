import type { AuthUser, LoginRequest, RegisterRequest, Role } from '@libro/shared';
import { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { addDays, addMinutes, type Clock } from '../lib/clock.js';
import { hashIp, randomToken, sha256Hex } from '../lib/crypto.js';
import { normalizeEmail } from '../lib/email.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User, type UserDoc } from '../models/User.js';
import { getDummyHash, hashPassword, verifyPassword } from './password.service.js';
import type { TokenService } from './token.service.js';

/** Intentos fallidos que disparan un bloqueo temporal (y cada múltiplo vuelve a bloquear). */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_BASE_MINUTES = 15;
const LOCK_MAX_MINUTES = 24 * 60;
/**
 * Dos pestañas pueden refrescar a la vez con el mismo token: la segunda llega con un token recién
 * rotado. Dentro de esta ventana se rechaza sin tumbar toda la familia de sesiones.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

const INVALID_CREDENTIALS =
  'Correo o contraseña incorrectos, o demasiados intentos. Inténtalo más tarde.';
const REGISTER_CONFLICT =
  'No se pudo completar el registro. Si ya tienes una cuenta, inicia sesión o recupera tu contraseña.';
const SESSION_INVALID = 'Tu sesión no es válida o caducó. Inicia sesión de nuevo.';

export interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface Session {
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthContext {
  userId: string;
  role: Role;
}

export interface AuthServiceOptions {
  tokens: TokenService;
  clock: Clock;
  /** Secreto para el HMAC de las IP almacenadas. */
  ipSecret: string;
  refreshTtlDays: number;
}

export function toAuthUser(user: Pick<UserDoc, 'id' | 'name' | 'email' | 'role'>): AuthUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

export function createAuthService(options: AuthServiceOptions) {
  const { tokens, clock, ipSecret, refreshTtlDays } = options;

  async function issueSession(
    user: UserDoc,
    meta: RequestMeta,
    familyId: string,
    refreshDocId?: Types.ObjectId,
  ): Promise<Session> {
    const now = clock();
    const refreshToken = randomToken();
    const refreshExpiresAt = addDays(now, refreshTtlDays);
    await RefreshToken.create({
      ...(refreshDocId ? { _id: refreshDocId } : {}),
      userId: user._id,
      tokenHash: sha256Hex(refreshToken),
      familyId,
      expiresAt: refreshExpiresAt,
      userAgent: meta.userAgent?.slice(0, 200),
      ipHash: meta.ip ? hashIp(meta.ip, ipSecret) : undefined,
    });
    const access = await tokens.signAccess({
      userId: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    return {
      accessToken: access.token,
      accessExpiresAt: access.expiresAt,
      refreshToken,
      refreshExpiresAt,
    };
  }

  async function revokeFamily(familyId: string): Promise<void> {
    await RefreshToken.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: clock() } });
  }

  /** Cuenta un intento fallido y, si corresponde, bloquea la cuenta (más tiempo cada vez). */
  async function registerFailedLogin(user: UserDoc): Promise<void> {
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { failedLoginCount: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated || updated.failedLoginCount % MAX_FAILED_LOGINS !== 0) return;
    const round = updated.failedLoginCount / MAX_FAILED_LOGINS;
    const minutes = Math.min(LOCK_BASE_MINUTES * 2 ** (round - 1), LOCK_MAX_MINUTES);
    await User.updateOne(
      { _id: user._id },
      { $set: { lockedUntil: addMinutes(clock(), minutes) } },
    );
  }

  return {
    async register(
      input: RegisterRequest,
      meta: RequestMeta,
    ): Promise<{ user: AuthUser; session: Session }> {
      const passwordHash = await hashPassword(input.password);
      let user: UserDoc;
      try {
        user = await User.create({
          email: input.email,
          emailNormalized: normalizeEmail(input.email),
          name: input.name,
          passwordHash,
          role: 'USER',
        });
      } catch (error) {
        // El índice único es la garantía real (también ante registros simultáneos).
        if (isDuplicateKeyError(error)) throw new AppError('CONFLICT', REGISTER_CONFLICT);
        throw error;
      }
      const session = await issueSession(user, meta, randomToken(16));
      return { user: toAuthUser(user), session };
    },

    async login(
      input: LoginRequest,
      meta: RequestMeta,
    ): Promise<{ user: AuthUser; session: Session }> {
      const user = await User.findOne({ emailNormalized: normalizeEmail(input.email) });
      if (!user) {
        // Misma carga de trabajo que con un usuario real: no se delata si el correo existe.
        await verifyPassword(await getDummyHash(), input.password);
        throw new AppError('AUTH_INVALID', INVALID_CREDENTIALS);
      }

      const now = clock();
      const locked =
        user.lockedUntil !== undefined && user.lockedUntil !== null && user.lockedUntil > now;
      const passwordOk = await verifyPassword(user.passwordHash, input.password);

      if (locked || user.status !== 'active') {
        // Cuenta bloqueada o desactivada: se rechaza aunque la contraseña sea correcta (mismo mensaje).
        throw new AppError('AUTH_INVALID', INVALID_CREDENTIALS);
      }
      if (!passwordOk) {
        await registerFailedLogin(user);
        throw new AppError('AUTH_INVALID', INVALID_CREDENTIALS);
      }

      await User.updateOne(
        { _id: user._id },
        { $set: { failedLoginCount: 0, lastLoginAt: now }, $unset: { lockedUntil: 1 } },
      );
      const session = await issueSession(user, meta, randomToken(16));
      return { user: toAuthUser(user), session };
    },

    /**
     * Rota el refresh token: el presentado queda invalidado y se entrega uno nuevo de la misma familia.
     * Presentar un token ya rotado fuera de la ventana de gracia revoca toda la familia (posible robo).
     */
    async refresh(
      refreshToken: string | undefined,
      meta: RequestMeta,
    ): Promise<{ user: AuthUser; session: Session }> {
      if (!refreshToken) throw new AppError('UNAUTHENTICATED', SESSION_INVALID);
      const tokenHash = sha256Hex(refreshToken);
      const now = clock();
      const newId = new Types.ObjectId();

      const rotated = await RefreshToken.findOneAndUpdate(
        { tokenHash, revokedAt: null, replacedBy: null, expiresAt: { $gt: now } },
        { $set: { revokedAt: now, replacedBy: newId } },
      );

      if (!rotated) {
        const existing = await RefreshToken.findOne({ tokenHash });
        if (existing && existing.expiresAt > now) {
          const rotatedJustNow =
            existing.replacedBy !== undefined &&
            existing.replacedBy !== null &&
            existing.revokedAt !== undefined &&
            existing.revokedAt !== null &&
            now.getTime() - existing.revokedAt.getTime() <= REFRESH_REUSE_GRACE_MS;
          if (!rotatedJustNow) await revokeFamily(existing.familyId);
        }
        throw new AppError('UNAUTHENTICATED', SESSION_INVALID);
      }

      const user = await User.findById(rotated.userId);
      if (!user || user.status !== 'active') {
        await revokeFamily(rotated.familyId);
        throw new AppError('UNAUTHENTICATED', SESSION_INVALID);
      }
      const session = await issueSession(user, meta, rotated.familyId, newId);
      return { user: toAuthUser(user), session };
    },

    /** Cierra la sesión: revoca toda la familia del refresh token. Idempotente. */
    async logout(refreshToken: string | undefined): Promise<void> {
      if (!refreshToken) return;
      const existing = await RefreshToken.findOne({ tokenHash: sha256Hex(refreshToken) });
      if (existing) await revokeFamily(existing.familyId);
    },

    /** Cierra todas las sesiones de un usuario (cambio de contraseña, desactivación…). */
    async revokeAllSessions(userId: string | Types.ObjectId): Promise<void> {
      await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
      await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: clock() } });
    },

    /**
     * Valida un access token y comprueba contra la BD que el usuario siga activo y que la versión
     * de tokens coincida; el rol se toma de la BD, así un cambio de rol aplica de inmediato.
     */
    async authenticate(accessToken: string): Promise<AuthContext | null> {
      const claims = await tokens.verifyAccess(accessToken);
      if (!claims || !Types.ObjectId.isValid(claims.userId)) return null;
      const user = await User.findById(claims.userId).select('role status tokenVersion');
      if (!user || user.status !== 'active' || user.tokenVersion !== claims.tokenVersion) {
        return null;
      }
      return { userId: user.id, role: user.role };
    },

    async getUserById(userId: string): Promise<AuthUser | null> {
      if (!Types.ObjectId.isValid(userId)) return null;
      const user = await User.findById(userId);
      return user ? toAuthUser(user) : null;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
